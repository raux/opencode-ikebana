import z from "zod"
import path from "path"
import { Effect } from "effect"
import { Tool } from "./tool"
import { AppFileSystem } from "../filesystem"
import { Instance } from "../project/instance"
import DESCRIPTION from "./chdir.txt"

export const ChdirTool = Tool.define(
  "chdir",
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service

    return {
      description: DESCRIPTION,
      parameters: z.object({
        path: z
          .string()
          .describe(
            "The path to the new working directory. Can be absolute or relative to the current working directory.",
          ),
      }),
      execute: (params: { path: string }, _ctx: Tool.Context) =>
        Effect.gen(function* () {
          const resolved = path.isAbsolute(params.path) ? params.path : path.resolve(Instance.directory, params.path)

          const exists = yield* fs.existsSafe(resolved)
          if (!exists) return yield* Effect.die(new Error(`Directory not found: ${resolved}`))

          const dir = yield* fs.isDir(resolved)
          if (!dir) return yield* Effect.die(new Error(`Not a directory: ${resolved}`))

          Instance.chdir(resolved)

          return {
            title: `cd ${resolved}`,
            output: `Working directory changed to ${resolved}. All file operations are now scoped to this directory.`,
            metadata: { directory: resolved },
          }
        }),
    }
  }),
)
