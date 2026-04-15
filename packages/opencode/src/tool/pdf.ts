import z from "zod"
import { Effect } from "effect"
import * as path from "path"
import { Tool } from "./tool"
import { AppFileSystem } from "../filesystem"
import { Instance } from "../project/instance"
import { assertExternalDirectoryEffect } from "./external-directory"
import DESCRIPTION from "./pdf.txt"

const parameters = z.object({
  filePath: z.string().describe("The absolute path to the PDF file to read"),
})

export const PdfTool = Tool.define(
  "pdf",
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service

    return {
      description: DESCRIPTION,
      parameters,
      execute: (params: z.infer<typeof parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          let filepath = params.filePath
          if (!path.isAbsolute(filepath)) {
            filepath = path.resolve(Instance.directory, filepath)
          }
          if (process.platform === "win32") {
            filepath = AppFileSystem.normalizePath(filepath)
          }
          const title = path.relative(Instance.worktree, filepath)

          const stat = yield* fs.stat(filepath).pipe(
            Effect.catchIf(
              (err) => "reason" in err && err.reason._tag === "NotFound",
              () => Effect.fail(new Error(`File not found: ${filepath}`)),
            ),
          )

          if (stat.type === "Directory") {
            return yield* Effect.fail(new Error(`Expected a file but got a directory: ${filepath}`))
          }

          const mime = AppFileSystem.mimeType(filepath)
          if (mime !== "application/pdf") {
            return yield* Effect.fail(new Error(`Expected a PDF file but got ${mime}: ${filepath}`))
          }

          yield* assertExternalDirectoryEffect(ctx, filepath, {
            bypass: Boolean(ctx.extra?.["bypassCwdCheck"]),
            kind: "file",
          })

          yield* ctx.ask({
            permission: "read",
            patterns: [filepath],
            always: ["*"],
            metadata: {},
          })

          const raw = yield* fs.readFile(filepath)
          const { extractText, getMeta } = yield* Effect.promise(() => import("unpdf"))

          const [text, meta] = yield* Effect.all([
            Effect.promise(() => extractText(new Uint8Array(raw), { mergePages: false })),
            Effect.promise(() => getMeta(new Uint8Array(raw))),
          ])

          const lines: string[] = []

          const info = meta.info as Record<string, unknown>
          if (info.Title) lines.push(`# ${info.Title}`, "")
          if (info.Author) lines.push(`**Author:** ${info.Author}`, "")

          for (let i = 0; i < text.totalPages; i++) {
            const page = (text.text as string[])[i] ?? ""
            const trimmed = page.trim()
            if (!trimmed) continue
            if (text.totalPages > 1) lines.push(`## Page ${i + 1}`, "")
            lines.push(trimmed, "")
          }

          const output = lines.join("\n").trim()
          if (!output) {
            return {
              title,
              output: "PDF contains no extractable text. It may be a scanned document or contain only images. Use the read tool to attach the PDF for vision-based reading.",
              metadata: { pages: text.totalPages },
            }
          }

          return {
            title,
            output,
            metadata: { pages: text.totalPages },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
