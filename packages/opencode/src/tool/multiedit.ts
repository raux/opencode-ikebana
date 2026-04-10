import z from "zod"
import { Tool } from "./tool"
import { EditTool } from "./edit"
import DESCRIPTION from "./multiedit.txt"
import path from "path"
import { Instance } from "../project/instance"
import { Effect } from "effect"

const Parameters = z.object({
  filePath: z.string().describe("The absolute path to the file to modify"),
  edits: z
    .array(
      z.object({
        filePath: z.string().describe("The absolute path to the file to modify"),
        oldString: z.string().describe("The text to replace"),
        newString: z.string().describe("The text to replace it with (must be different from oldString)"),
        replaceAll: z.boolean().optional().describe("Replace all occurrences of oldString (default false)"),
      }),
    )
    .describe("Array of edit operations to perform sequentially on the file"),
})

export const MultiEditTool = Tool.defineEffect(
  "multiedit",
  Effect.gen(function* () {
    const tool = yield* Tool.init(EditTool)

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const results = []
          for (const [, edit] of params.edits.entries()) {
            const result = yield* Effect.promise(() =>
              tool.execute(
                {
                  filePath: params.filePath,
                  oldString: edit.oldString,
                  newString: edit.newString,
                  replaceAll: edit.replaceAll,
                },
                ctx,
              ),
            )
            results.push(result)
          }
          return {
            title: path.relative(Instance.worktree, params.filePath),
            metadata: {
              results: results.map((r) => r.metadata),
            },
            output: results.at(-1)!.output,
          }
        }).pipe(Effect.orDie, Effect.runPromise),
    }
  }),
)
