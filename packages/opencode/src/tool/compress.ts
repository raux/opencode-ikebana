import z from "zod"
import path from "path"
import { Effect } from "effect"
import { Tool } from "./tool"
import DESCRIPTION from "./compress.txt"
import { Instance } from "../project/instance"
import { AppFileSystem } from "../filesystem"

const parameters = z.object({
  filePath: z
    .string()
    .optional()
    .describe("Absolute path to a file to compress. If provided, reads and compresses the file content."),
  content: z.string().optional().describe("Direct text content to compress. Used when filePath is not provided."),
  level: z
    .enum(["lite", "full", "ultra"])
    .default("full")
    .optional()
    .describe(
      'Compression level: "lite" (professional, tight), "full" (fragments ok, shorter synonyms), "ultra" (maximum abbreviation with arrows and abbreviations)',
    ),
})

// Words/phrases to remove at each level
const ARTICLES = /\b(?:a|an|the)\b/gi
const FILLER = /\b(?:just|really|basically|actually|simply|quite|very|pretty much|somewhat|rather|fairly)\b/gi
const PLEASANTRIES =
  /\b(?:sure|certainly|of course|absolutely|definitely|please note that|it'?s worth noting that|note that|it should be noted that|i'?d be happy to|let me)\b/gi
const HEDGING =
  /\b(?:it might be worth|perhaps|maybe|i think|i believe|it seems like|it appears that|probably|possibly|generally speaking|in general|typically|usually)\b/gi
const VERBOSE_PHRASES: [RegExp, string][] = [
  [/\bin order to\b/gi, "to"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bat this point in time\b/gi, "now"],
  [/\bin the event that\b/gi, "if"],
  [/\bfor the purpose of\b/gi, "for"],
  [/\bwith regard to\b/gi, "re"],
  [/\bin relation to\b/gi, "re"],
  [/\bas a result of\b/gi, "from"],
  [/\bin the case of\b/gi, "for"],
  [/\bprior to\b/gi, "before"],
  [/\bsubsequent to\b/gi, "after"],
  [/\bin addition to\b/gi, "plus"],
  [/\bwith respect to\b/gi, "re"],
  [/\bon the other hand\b/gi, "but"],
  [/\bhowever,?\s*/gi, "but "],
  [/\btherefore,?\s*/gi, "so "],
  [/\bfurthermore,?\s*/gi, "also "],
  [/\bmoreover,?\s*/gi, "also "],
  [/\bnevertheless,?\s*/gi, "but "],
  [/\bnonetheless,?\s*/gi, "but "],
  [/\badditionally,?\s*/gi, "also "],
  [/\bconsequently,?\s*/gi, "so "],
  [/\baccordingly,?\s*/gi, "so "],
  [/\bmake sure to\b/gi, ""],
  [/\byou should\b/gi, ""],
  [/\byou need to\b/gi, ""],
  [/\byou can\b/gi, "can"],
  [/\byou will need to\b/gi, "need to"],
  [/\bremember to\b/gi, ""],
  [/\bkeep in mind that\b/gi, ""],
  [/\bit is important to\b/gi, ""],
  [/\bplease\b/gi, ""],
]

const ULTRA_ABBREVS: [RegExp, string][] = [
  [/\bdatabase\b/gi, "DB"],
  [/\bauthentication\b/gi, "auth"],
  [/\bauthorization\b/gi, "authz"],
  [/\bconfiguration\b/gi, "config"],
  [/\brequest\b/gi, "req"],
  [/\bresponse\b/gi, "res"],
  [/\bfunction\b/gi, "fn"],
  [/\bimplementation\b/gi, "impl"],
  [/\bapplication\b/gi, "app"],
  [/\benvironment\b/gi, "env"],
  [/\bdirectory\b/gi, "dir"],
  [/\brepository\b/gi, "repo"],
  [/\bdependency\b/gi, "dep"],
  [/\bdependencies\b/gi, "deps"],
  [/\bdevelopment\b/gi, "dev"],
  [/\bproduction\b/gi, "prod"],
  [/\bparameter\b/gi, "param"],
  [/\bparameters\b/gi, "params"],
  [/\bresults? in\b/gi, "→"],
  [/\bleads? to\b/gi, "→"],
  [/\bcauses?\b/gi, "→"],
  [/\bwhich means\b/gi, "→"],
  [/\band then\b/gi, "→"],
]

export type Segment = { kind: "protected"; text: string } | { kind: "text"; text: string }

export function segment(input: string): Segment[] {
  const result: Segment[] = []
  // Match fenced code blocks, inline code, URLs, and file paths
  const pattern = /```[\s\S]*?```|`[^`\n]+`|https?:\/\/\S+|(?:\/[\w.-]+){2,}/g
  let last = 0
  for (const match of input.matchAll(pattern)) {
    if (match.index > last) result.push({ kind: "text", text: input.slice(last, match.index) })
    result.push({ kind: "protected", text: match[0] })
    last = match.index + match[0].length
  }
  if (last < input.length) result.push({ kind: "text", text: input.slice(last) })
  return result
}

function collapse(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^ +/gm, "")
    .replace(/ +$/gm, "")
    .replace(/ ([.,;:!?])/g, "$1")
}

function lite(text: string): string {
  let out = text
  out = out.replace(FILLER, "")
  out = out.replace(PLEASANTRIES, "")
  out = out.replace(HEDGING, "")
  for (const [pat, rep] of VERBOSE_PHRASES) out = out.replace(pat, rep)
  return collapse(out)
}

function full(text: string): string {
  let out = lite(text)
  out = out.replace(ARTICLES, "")
  return collapse(out)
}

function ultra(text: string): string {
  let out = full(text)
  for (const [pat, rep] of ULTRA_ABBREVS) out = out.replace(pat, rep)
  return collapse(out)
}

export function compress(input: string, level: "lite" | "full" | "ultra"): string {
  const fn = level === "lite" ? lite : level === "ultra" ? ultra : full
  return segment(input)
    .map((s) => (s.kind === "protected" ? s.text : fn(s.text)))
    .join("")
}

type Metadata = {
  original: number
  compressed: number
  ratio: number
  filePath?: string
}

export const CompressTool = Tool.define<typeof parameters, Metadata, AppFileSystem.Service>(
  "compress",
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service

    return {
      description: DESCRIPTION,
      parameters,
      execute: (params: z.infer<typeof parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          if (!params.filePath && !params.content) {
            throw new Error("Either filePath or content must be provided")
          }

          let text = params.content ?? ""
          let file: string | undefined

          if (params.filePath) {
            file = path.isAbsolute(params.filePath) ? params.filePath : path.resolve(Instance.directory, params.filePath)
            yield* ctx.ask({
              permission: "read",
              patterns: [file],
              always: ["*"],
              metadata: { filePath: file },
            })
            text = yield* fs.readFileString(file).pipe(Effect.orDie)
          }

          const level = params.level ?? "full"
          const result = compress(text, level)
          const ratio = text.length > 0 ? Math.round((1 - result.length / text.length) * 100) : 0

          return {
            title: file ? path.relative(Instance.worktree, file) : `${ratio}% reduction`,
            output: result,
            metadata: {
              original: text.length,
              compressed: result.length,
              ratio,
              ...(file && { filePath: file }),
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
