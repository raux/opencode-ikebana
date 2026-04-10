import z from "zod"
import { Effect } from "effect"
import { Tool } from "./tool"

const parameters = z.object({
  tool: z.string(),
  error: z.string(),
})

export const InvalidTool = Tool.define("invalid", {
  description: "Do not use",
  parameters,
  execute: (params: z.infer<typeof parameters>) =>
    Effect.succeed({
      title: "Invalid Tool",
      output: `The arguments provided to the tool are invalid: ${params.error}`,
      metadata: {},
    }).pipe(Effect.runPromise),
})
