import { BusEvent } from "@/bus/bus-event"
import { InstanceState } from "@/effect/instance-state"
import { makeRunPromise } from "@/effect/run-service"
import { SessionID, MessageID } from "@/session/schema"
import { Effect, Fiber, Layer, ServiceMap } from "effect"
import z from "zod"
import { Config } from "../config/config"
import PROMPT_INITIALIZE from "./template/initialize.txt"
import PROMPT_REVIEW from "./template/review.txt"
import { MCP } from "../mcp"
import { Skill } from "../skill"
import { Log } from "../util/log"

export namespace Command {
  const log = Log.create({ service: "command" })

  type State = {
    commands: Record<string, Info>
    ensure: () => Promise<void>
  }

  export const Event = {
    Executed: BusEvent.define(
      "command.executed",
      z.object({
        name: z.string(),
        sessionID: SessionID.zod,
        arguments: z.string(),
        messageID: MessageID.zod,
      }),
    ),
  }

  export const Info = z
    .object({
      name: z.string(),
      description: z.string().optional(),
      agent: z.string().optional(),
      model: z.string().optional(),
      source: z.enum(["command", "mcp", "skill"]).optional(),
      template: z.promise(z.string()).or(z.string()),
      subtask: z.boolean().optional(),
      hints: z.array(z.string()),
    })
    .meta({
      ref: "Command",
    })

  export type Info = Omit<z.infer<typeof Info>, "template"> & { template: Promise<string> | string }

  export function hints(template: string): string[] {
    const result: string[] = []
    const numbered = template.match(/\$\d+/g)
    if (numbered) {
      for (const match of [...new Set(numbered)].sort()) result.push(match)
    }
    if (template.includes("$ARGUMENTS")) result.push("$ARGUMENTS")
    return result
  }

  export const Default = {
    INIT: "init",
    REVIEW: "review",
  } as const

  export interface Interface {
    readonly get: (name: string) => Effect.Effect<Info | undefined>
    readonly list: () => Effect.Effect<Info[]>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Command") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const cache = yield* InstanceState.make<State>(
        Effect.fn("Command.state")(function* (ctx) {
          const commands: Record<string, Info> = {}
          let task: Promise<void> | undefined

<<<<<<< HEAD
          async function load() {
            const cfg = await Config.get()
||||||| parent of 8e11a46fe (use forkScoped + Fiber.join for lazy init (match old Instance.state behavior))
      const commands = yield* Effect.promise(async () => {
        const cfg = await Config.get()
=======
      const commands: Record<string, Info> = {}
>>>>>>> 8e11a46fe (use forkScoped + Fiber.join for lazy init (match old Instance.state behavior))

<<<<<<< HEAD
            commands[Default.INIT] = {
              name: Default.INIT,
              description: "create/update AGENTS.md",
              source: "command",
              get template() {
                return PROMPT_INITIALIZE.replace("${path}", ctx.worktree)
              },
              hints: hints(PROMPT_INITIALIZE),
            }
            commands[Default.REVIEW] = {
              name: Default.REVIEW,
              description: "review changes [commit|branch|pr], defaults to uncommitted",
              source: "command",
              get template() {
                return PROMPT_REVIEW.replace("${path}", ctx.worktree)
              },
              subtask: true,
              hints: hints(PROMPT_REVIEW),
            }

            for (const [name, command] of Object.entries(cfg.command ?? {})) {
              commands[name] = {
                name,
                agent: command.agent,
                model: command.model,
                description: command.description,
                source: "command",
                get template() {
                  return command.template
                },
                subtask: command.subtask,
                hints: hints(command.template),
              }
            }

            for (const [name, prompt] of Object.entries(await MCP.prompts())) {
              commands[name] = {
                name,
                source: "mcp",
                description: prompt.description,
                get template() {
                  return new Promise<string>(async (resolve, reject) => {
                    const template = await MCP.getPrompt(
                      prompt.client,
                      prompt.name,
                      prompt.arguments
                        ? Object.fromEntries(prompt.arguments.map((argument, i) => [argument.name, `$${i + 1}`]))
                        : {},
                    ).catch(reject)
                    resolve(
                      template?.messages
                        .map((message) => (message.content.type === "text" ? message.content.text : ""))
                        .join("\n") || "",
                    )
                  })
                },
                hints: prompt.arguments?.map((_, i) => `$${i + 1}`) ?? [],
              }
            }

            for (const skill of await Skill.all()) {
              if (commands[skill.name]) continue
              commands[skill.name] = {
                name: skill.name,
                description: skill.description,
                source: "skill",
                get template() {
                  return skill.content
                },
                hints: [],
              }
            }
||||||| parent of 8e11a46fe (use forkScoped + Fiber.join for lazy init (match old Instance.state behavior))
        const result: Record<string, Info> = {
          [Default.INIT]: {
            name: Default.INIT,
            description: "create/update AGENTS.md",
            source: "command",
            get template() {
              return PROMPT_INITIALIZE.replace("${path}", instance.worktree)
            },
            hints: hints(PROMPT_INITIALIZE),
          },
          [Default.REVIEW]: {
            name: Default.REVIEW,
            description: "review changes [commit|branch|pr], defaults to uncommitted",
            source: "command",
            get template() {
              return PROMPT_REVIEW.replace("${path}", instance.worktree)
            },
            subtask: true,
            hints: hints(PROMPT_REVIEW),
          },
        }

        for (const [name, command] of Object.entries(cfg.command ?? {})) {
          result[name] = {
            name,
            agent: command.agent,
            model: command.model,
            description: command.description,
            source: "command",
            get template() {
              return command.template
            },
            subtask: command.subtask,
            hints: hints(command.template),
=======
      const load = Effect.fn("Command.load")(function* () {
        yield* Effect.promise(async () => {
          const cfg = await Config.get()

          commands[Default.INIT] = {
            name: Default.INIT,
            description: "create/update AGENTS.md",
            source: "command",
            get template() {
              return PROMPT_INITIALIZE.replace("${path}", instance.worktree)
            },
            hints: hints(PROMPT_INITIALIZE),
          }
          commands[Default.REVIEW] = {
            name: Default.REVIEW,
            description: "review changes [commit|branch|pr], defaults to uncommitted",
            source: "command",
            get template() {
              return PROMPT_REVIEW.replace("${path}", instance.worktree)
            },
            subtask: true,
            hints: hints(PROMPT_REVIEW),
>>>>>>> 8e11a46fe (use forkScoped + Fiber.join for lazy init (match old Instance.state behavior))
          }

<<<<<<< HEAD
          return {
            commands,
            ensure: () => {
              task ??= Effect.runPromise(
                Effect.tryPromise({
                  try: load,
                  catch: (cause) => cause,
                }).pipe(Effect.catchCause((cause) => Effect.sync(() => log.error("init failed", { cause })))),
              )
              return task
            },
||||||| parent of 8e11a46fe (use forkScoped + Fiber.join for lazy init (match old Instance.state behavior))
        // Add skills as invokable commands
        for (const skill of await Skill.all()) {
          // Skip if a command with this name already exists
          if (result[skill.name]) continue
          result[skill.name] = {
            name: skill.name,
            description: skill.description,
            source: "skill",
            get template() {
              return skill.content
            },
            hints: [],
=======
          for (const [name, command] of Object.entries(cfg.command ?? {})) {
            commands[name] = {
              name,
              agent: command.agent,
              model: command.model,
              description: command.description,
              source: "command",
              get template() {
                return command.template
              },
              subtask: command.subtask,
              hints: hints(command.template),
            }
          }
          for (const [name, prompt] of Object.entries(await MCP.prompts())) {
            commands[name] = {
              name,
              source: "mcp",
              description: prompt.description,
              get template() {
                // since a getter can't be async we need to manually return a promise here
                return new Promise<string>(async (resolve, reject) => {
                  const template = await MCP.getPrompt(
                    prompt.client,
                    prompt.name,
                    prompt.arguments
                      ? // substitute each argument with $1, $2, etc.
                        Object.fromEntries(prompt.arguments?.map((argument, i) => [argument.name, `$${i + 1}`]))
                      : {},
                  ).catch(reject)
                  resolve(
                    template?.messages
                      .map((message) => (message.content.type === "text" ? message.content.text : ""))
                      .join("\n") || "",
                  )
                })
              },
              hints: prompt.arguments?.map((_, i) => `$${i + 1}`) ?? [],
            }
>>>>>>> 8e11a46fe (use forkScoped + Fiber.join for lazy init (match old Instance.state behavior))
          }
<<<<<<< HEAD
        }),
      )
||||||| parent of 8e11a46fe (use forkScoped + Fiber.join for lazy init (match old Instance.state behavior))
        }

        return result
      })
=======

          // Add skills as invokable commands
          for (const skill of await Skill.all()) {
            // Skip if a command with this name already exists
            if (commands[skill.name]) continue
            commands[skill.name] = {
              name: skill.name,
              description: skill.description,
              source: "skill",
              get template() {
                return skill.content
              },
              hints: [],
            }
          }
        })
      })
>>>>>>> 8e11a46fe (use forkScoped + Fiber.join for lazy init (match old Instance.state behavior))

      const loadFiber = yield* load().pipe(
        Effect.catchCause(() => Effect.void),
        Effect.forkScoped,
      )

      const get = Effect.fn("Command.get")(function* (name: string) {
<<<<<<< HEAD
        const state = yield* InstanceState.get(cache)
        yield* Effect.promise(() => state.ensure())
        return state.commands[name]
||||||| parent of 8e11a46fe (use forkScoped + Fiber.join for lazy init (match old Instance.state behavior))
        return commands[name]
=======
        yield* Fiber.join(loadFiber)
        return commands[name]
>>>>>>> 8e11a46fe (use forkScoped + Fiber.join for lazy init (match old Instance.state behavior))
      })

      const list = Effect.fn("Command.list")(function* () {
<<<<<<< HEAD
        const state = yield* InstanceState.get(cache)
        yield* Effect.promise(() => state.ensure())
        return Object.values(state.commands)
||||||| parent of 8e11a46fe (use forkScoped + Fiber.join for lazy init (match old Instance.state behavior))
        return Object.values(commands)
=======
        yield* Fiber.join(loadFiber)
        return Object.values(commands)
>>>>>>> 8e11a46fe (use forkScoped + Fiber.join for lazy init (match old Instance.state behavior))
      })

      return Service.of({ get, list })
    }),
  )

  const runPromise = makeRunPromise(Service, layer)

  export async function get(name: string) {
    return runPromise((svc) => svc.get(name))
  }

  export async function list() {
    return runPromise((svc) => svc.list())
  }
}
