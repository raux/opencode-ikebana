import z from "zod"
import path from "path"
import { Effect, Stream } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { Tool } from "./tool"
import { Config } from "../config/config"
import { Instance } from "../project/instance"
import DESCRIPTION from "./transcribe.txt"

const DEFAULT_URL = "http://localhost:8978"
const TIMEOUT = 120_000

const Parameters = z.object({
  file: z.string().describe("Path to audio file to transcribe (wav, mp3, m4a, ogg, flac, webm, mp4)"),
  language: z
    .string()
    .optional()
    .describe("ISO 639-1 language code to guide recognition (e.g. 'en', 'de', 'ja'). Omit for auto-detection."),
  task: z
    .enum(["transcribe", "translate"])
    .optional()
    .describe("'transcribe' (default) or 'translate' (translate to English, engine-dependent)"),
})

export const TranscribeTool = Tool.define(
  "transcribe",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const config = yield* Config.Service

    const exec = (bin: string, argv: string[], cwd?: string) =>
      Effect.gen(function* () {
        const proc = ChildProcess.make(bin, argv, {
          cwd,
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

    const resolve = (file: string) => (path.isAbsolute(file) ? file : path.resolve(Instance.directory, file))

    const viaApi = (filepath: string, params: z.infer<typeof Parameters>) =>
      Effect.gen(function* () {
        const cfg = yield* config.get()
        const base = cfg.speech?.typewhisper?.url ?? DEFAULT_URL

        // Check if TypeWhisper API is available
        const status = yield* http
          .execute(HttpClientRequest.get(`${base}/v1/status`))
          .pipe(
            Effect.timeoutOrElse({
              duration: "3 seconds",
              orElse: () => Effect.fail(new Error("timeout")),
            }),
            Effect.catchAll(() => Effect.fail(new Error("TypeWhisper API not available"))),
          )

        if (status.status !== 200) return yield* Effect.fail(new Error("TypeWhisper API not ready"))

        // Build multipart form data using fetch
        const data = yield* Effect.promise(async () => {
          const file = Bun.file(filepath)
          const form = new FormData()
          form.append("file", file)
          if (params.language) form.append("language", params.language)
          if (params.task) form.append("task", params.task)
          return form
        })

        const response = yield* Effect.promise(() =>
          fetch(`${base}/v1/transcribe`, {
            method: "POST",
            body: data,
            signal: AbortSignal.timeout(TIMEOUT),
          }),
        )

        if (!response.ok) {
          const body = yield* Effect.promise(() => response.text())
          return yield* Effect.fail(new Error(`TypeWhisper API error (${response.status}): ${body}`))
        }

        const json = (yield* Effect.promise(() => response.json())) as {
          text: string
          language?: string
          duration?: number
          processing_time?: number
          engine?: string
          model?: string
        }

        return {
          text: json.text,
          language: json.language,
          duration: json.duration,
          engine: "typewhisper-api",
          model: json.model,
        }
      })

    const viaCli = (filepath: string, params: z.infer<typeof Parameters>) =>
      Effect.gen(function* () {
        const argv = ["transcribe", filepath, "--json"]
        if (params.language) argv.push("--language", params.language)
        if (params.task) argv.push("--task", params.task)

        const result = yield* exec("typewhisper", argv)
        if (result.exit !== 0) return yield* Effect.fail(new Error(`typewhisper CLI failed: ${result.stderr}`))

        const parsed = JSON.parse(result.stdout) as {
          text: string
          language?: string
          duration?: number
        }
        return {
          text: parsed.text,
          language: parsed.language,
          duration: parsed.duration,
          engine: "typewhisper-cli",
          model: undefined,
        }
      })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const filepath = resolve(params.file)

          yield* ctx.ask({
            permission: "transcribe",
            patterns: [filepath],
            always: ["*"],
            metadata: {
              file: filepath,
              language: params.language,
              task: params.task,
            },
          })

          // Check file exists
          const exists = yield* Effect.promise(async () => {
            const f = Bun.file(filepath)
            return f.exists()
          })
          if (!exists) {
            return {
              title: "File not found",
              output: `Audio file not found: ${filepath}`,
              metadata: {},
            }
          }

          // Try TypeWhisper API first, then CLI
          const result = yield* viaApi(filepath, params).pipe(
            Effect.catchAll(() => viaCli(filepath, params)),
            Effect.catchAll(
              (err) =>
                Effect.succeed({
                  text: "",
                  language: undefined,
                  duration: undefined,
                  engine: "none",
                  model: undefined,
                  error: err instanceof Error ? err.message : String(err),
                } as {
                  text: string
                  language: string | undefined
                  duration: number | undefined
                  engine: string
                  model: string | undefined
                  error: string
                }),
            ),
          )

          if ("error" in result) {
            return {
              title: "Transcription failed",
              output: [
                `Failed to transcribe ${path.basename(filepath)}: ${result.error}`,
                "",
                "To use this tool, ensure one of:",
                "- TypeWhisper is running with the HTTP API enabled (Settings > Advanced, default port 8978)",
                "- The `typewhisper` CLI is installed (Settings > Advanced > CLI Tool > Install)",
              ].join("\n"),
              metadata: {},
            }
          }

          const meta = [
            result.language ? `Language: ${result.language}` : null,
            result.duration ? `Duration: ${result.duration.toFixed(1)}s` : null,
            `Engine: ${result.engine}`,
            result.model ? `Model: ${result.model}` : null,
          ]
            .filter(Boolean)
            .join(", ")

          return {
            title: `Transcribed ${path.basename(filepath)}`,
            output: [`${result.text}`, "", `---`, meta].join("\n"),
            metadata: {
              language: result.language,
              duration: result.duration,
              engine: result.engine,
              model: result.model,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
