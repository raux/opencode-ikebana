import type { Agent } from "../agent/agent"
import { Config } from "../config/config"
import { Session } from "../session"
import { SessionPrompt } from "../session/prompt"
import { SessionID } from "../session/schema"
import type { ModelID, ProviderID } from "../provider/schema"
import { Effect } from "effect"

type Ref = {
  providerID: ProviderID
  modelID: ModelID
}

type Parts = Awaited<ReturnType<typeof SessionPrompt.resolvePromptParts>>
type Reply = Awaited<ReturnType<typeof SessionPrompt.prompt>>

type Deps = {
  cfg: Effect.Effect<Config.Info>
  get: (taskID: string) => Effect.Effect<Session.Info | undefined>
  create: (input: { parentID: SessionID; title: string }) => Effect.Effect<Session.Info>
  resolve: (prompt: string) => Effect.Effect<Parts>
  prompt: (input: {
    sessionID: SessionID
    model: Ref
    agent: string
    tools: Record<string, boolean>
    parts: Parts
  }) => Effect.Effect<Reply>
}

type Input = {
  parentID: SessionID
  taskID?: string
  description: string
  prompt: string
  agent: Agent.Info
  model: Ref
  start?: (sessionID: SessionID, model: Ref) => Promise<void> | void
}

export function tools(agent: Agent.Info, cfg: Config.Info) {
  const task = agent.permission.some((rule) => rule.permission === "task")
  const todo = agent.permission.some((rule) => rule.permission === "todowrite")
  return {
    ...(todo ? {} : { todowrite: false }),
    ...(task ? {} : { task: false }),
    ...Object.fromEntries((cfg.experimental?.primary_tools ?? []).map((tool) => [tool, false])),
  }
}

export function output(sessionID: SessionID, text: string) {
  return [
    `task_id: ${sessionID} (for resuming to continue this task if needed)`,
    "",
    "<task_result>",
    text,
    "</task_result>",
  ].join("\n")
}

export const run = Effect.fn("Subtask.run")(function* (deps: Deps, input: Input) {
  const cfg = yield* deps.cfg
  const model = input.agent.model ?? input.model
  const found = input.taskID ? yield* deps.get(input.taskID) : undefined
  const session = found
    ? found
    : yield* deps.create({
        parentID: input.parentID,
        title: input.description + ` (@${input.agent.name} subagent)`,
      })

  yield* Effect.promise(() => Promise.resolve(input.start?.(session.id, model)))

  const result = yield* deps.prompt({
    sessionID: session.id,
    model,
    agent: input.agent.name,
    tools: tools(input.agent, cfg),
    parts: yield* deps.resolve(input.prompt),
  })

  return {
    sessionID: session.id,
    model,
    text: result.parts.findLast((part) => part.type === "text")?.text ?? "",
  }
})
