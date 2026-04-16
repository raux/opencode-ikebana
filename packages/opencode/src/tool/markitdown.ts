import z from "zod"
import * as path from "path"
import { Effect } from "effect"
import { Tool } from "./tool"
import { AppFileSystem } from "../filesystem"
import { Instance } from "../project/instance"
import { assertExternalDirectoryEffect } from "./external-directory"
import { MarkItDown } from "../markitdown"
import DESCRIPTION from "./markitdown.txt"

const parameters = z.object({
  filePath: z.string().describe("The absolute path to the file to convert to markdown"),
})

export const MarkitdownTool = Tool.define(
  "markitdown",
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service
    const mid = new MarkItDown()

    return {
      description: DESCRIPTION,
      parameters,
      execute: (params: z.infer<typeof parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          let filepath = params.filePath
          if (!path.isAbsolute(filepath)) {
            filepath = path.resolve(Instance.directory, filepath)
          }
          const title = path.relative(Instance.worktree, filepath)

          const stat = yield* fs.stat(filepath).pipe(
            Effect.catchIf(
              (err) => "reason" in err && err.reason._tag === "NotFound",
              () => Effect.succeed(undefined),
            ),
          )

          if (!stat) return yield* Effect.fail(new Error(`File not found: ${filepath}`))
          if (stat.type === "Directory") return yield* Effect.fail(new Error(`Cannot convert a directory: ${filepath}`))

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

          const data = yield* fs.readFile(filepath)
          const ext = path.extname(filepath).toLowerCase()
          const mime = AppFileSystem.mimeType(filepath)

          const result = yield* Effect.promise(() =>
            mid.convert(new Uint8Array(data), {
              mimetype: mime,
              extension: ext,
              filename: path.basename(filepath),
              path: filepath,
            }),
          )

          const header = result.title ? `# ${result.title}\n\n` : ""
          return {
            title,
            output: `${header}${result.markdown}`,
            metadata: {
              filepath,
              pages: result.title,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
