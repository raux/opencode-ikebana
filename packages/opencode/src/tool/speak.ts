import z from "zod"
import { Effect, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { Tool } from "./tool"
import { Config } from "../config/config"
import DESCRIPTION from "./speak.txt"

const Parameters = z.object({
  text: z.string().describe("The text content to speak aloud"),
  voice: z
    .string()
    .optional()
    .describe("Voice name to use (platform-dependent, e.g. 'Alex' on macOS, 'en' on Linux)"),
  rate: z
    .number()
    .optional()
    .describe("Speech rate - words per minute on macOS (default ~175), or speed factor on Linux"),
})

function cmd(platform: string): string[] | undefined {
  if (platform === "darwin") return ["say"]
  if (platform === "win32") return ["powershell", "-Command"]
  return undefined
}

function args(platform: string, params: z.infer<typeof Parameters>): string[] {
  if (platform === "darwin") {
    const result: string[] = []
    if (params.voice) result.push("-v", params.voice)
    if (params.rate) result.push("-r", String(params.rate))
    result.push(params.text)
    return result
  }
  if (platform === "win32") {
    const escaped = params.text.replace(/'/g, "''")
    const ps = params.rate
      ? `$s = New-Object -ComObject SAPI.SpVoice; $s.Rate = ${Math.round((params.rate - 175) / 35)}; $s.Speak('${escaped}')`
      : `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak('${escaped}')`
    return [ps]
  }
  return []
}

const LINUX_TTS = ["espeak-ng", "espeak", "spd-say"] as const

export const SpeakTool = Tool.define(
  "speak",
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const config = yield* Config.Service

    const exec = (bin: string, argv: string[]) =>
      Effect.gen(function* () {
        const proc = ChildProcess.make(bin, argv, {
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        })
        const handle = yield* spawner.spawn(proc)
        const [stdout, stderr] = yield* Effect.all(
          [Stream.mkString(Stream.decodeText(handle.stdout)), Stream.mkString(Stream.decodeText(handle.stderr))],
          { concurrency: 2 },
        )
        const exit = yield* handle.exitCode
        return { exit, stdout, stderr }
      })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const cfg = yield* config.get()
          const voice = params.voice ?? cfg.speech?.tts?.voice
          const rate = params.rate ?? cfg.speech?.tts?.rate
          const resolved = { ...params, voice, rate }

          yield* ctx.ask({
            permission: "speak",
            patterns: [params.text.slice(0, 80)],
            always: ["*"],
            metadata: {
              text: params.text.slice(0, 200),
              voice: resolved.voice,
              rate: resolved.rate,
            },
          })

          const platform = process.platform

          // macOS or Windows: use built-in TTS
          const bin = cmd(platform)
          if (bin) {
            const argv = args(platform, resolved)
            const result = yield* exec(bin[0], [...bin.slice(1), ...argv])
            if (result.exit !== 0) {
              return {
                title: "Speech failed",
                output: `TTS command failed (exit ${result.exit}): ${result.stderr}`,
                metadata: {},
              }
            }
            return {
              title: `Spoke: "${params.text.slice(0, 60)}${params.text.length > 60 ? "…" : ""}"`,
              output: "Text was spoken aloud successfully.",
              metadata: { platform, engine: bin[0] },
            }
          }

          // Linux: try espeak-ng, espeak, spd-say in order
          for (const engine of LINUX_TTS) {
            const argv: string[] = []
            if (resolved.voice && engine !== "spd-say") argv.push("-v", resolved.voice)
            if (resolved.rate && engine !== "spd-say") argv.push("-s", String(resolved.rate))
            argv.push(params.text)

            const result = yield* exec(engine, argv).pipe(
              Effect.catchAll(() => Effect.succeed({ exit: 127, stdout: "", stderr: "not found" })),
            )
            if (result.exit === 0) {
              return {
                title: `Spoke: "${params.text.slice(0, 60)}${params.text.length > 60 ? "…" : ""}"`,
                output: "Text was spoken aloud successfully.",
                metadata: { platform, engine },
              }
            }
          }

          return {
            title: "No TTS engine available",
            output:
              "No text-to-speech engine found. On macOS, the `say` command is built-in. On Linux, install espeak-ng (`apt install espeak-ng`) or espeak. On Windows, PowerShell TTS is built-in.",
            metadata: {},
          }
        }).pipe(Effect.orDie),
    }
  }),
)
