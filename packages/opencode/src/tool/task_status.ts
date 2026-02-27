import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./task_status.txt"
import { Identifier } from "../id/id"
import { Session } from "../session"
import { SessionStatus } from "../session/status"
import { MessageV2 } from "../session/message-v2"

type State = "running" | "completed" | "error"

const DEFAULT_TIMEOUT = 60_000
const POLL_MS = 300

const parameters = z.object({
  task_id: Identifier.schema("session").describe("The task_id returned by the task tool"),
  wait: z.boolean().optional().describe("When true, wait until the task reaches a terminal state or timeout"),
  timeout_ms: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum milliseconds to wait when wait=true (default: 60000)"),
})

function format(input: { taskID: string; state: State; text: string }) {
  return [`task_id: ${input.taskID}`, `state: ${input.state}`, "", "<task_result>", input.text, "</task_result>"].join(
    "\n",
  )
}

function errorText(error: NonNullable<MessageV2.Assistant["error"]>) {
  const data = error.data as Record<string, unknown> | undefined
  const message = data?.message
  if (typeof message === "string" && message) return message
  return error.name
}

async function inspect(taskID: string) {
  const status = SessionStatus.get(taskID)
  if (status.type === "busy" || status.type === "retry") {
    return {
      state: "running" as const,
      text: status.type === "retry" ? `Task is retrying: ${status.message}` : "Task is still running.",
    }
  }

  for await (const item of MessageV2.stream(taskID)) {
    if (item.info.role !== "assistant") continue

    const text = item.parts.findLast((part) => part.type === "text")?.text ?? ""
    if (item.info.error) {
      const summary = errorText(item.info.error)
      return {
        state: "error" as const,
        text: text || summary,
      }
    }

    const done = item.info.finish && !["tool-calls", "unknown"].includes(item.info.finish)
    if (done) {
      return {
        state: "completed" as const,
        text,
      }
    }

    return {
      state: "running" as const,
      text: text || "Task is still running.",
    }
  }

  return {
    state: "running" as const,
    text: "Task has started but has not produced output yet.",
  }
}

function sleep(ms: number, abort: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (abort.aborted) {
      reject(new Error("Task status polling aborted"))
      return
    }

    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error("Task status polling aborted"))
    }

    const timer = setTimeout(() => {
      abort.removeEventListener("abort", onAbort)
      resolve()
    }, ms)

    abort.addEventListener("abort", onAbort, { once: true })
  })
}

export const TaskStatusTool = Tool.define("task_status", {
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx) {
    await Session.get(params.task_id)

    let result = await inspect(params.task_id)
    if (!params.wait || result.state !== "running") {
      return {
        title: "Task status",
        metadata: {
          task_id: params.task_id,
          state: result.state,
          timed_out: false,
        },
        output: format({ taskID: params.task_id, state: result.state, text: result.text }),
      }
    }

    const timeout = params.timeout_ms ?? DEFAULT_TIMEOUT
    const end = Date.now() + timeout
    while (Date.now() < end) {
      const left = end - Date.now()
      await sleep(Math.min(POLL_MS, left), ctx.abort)
      result = await inspect(params.task_id)
      if (result.state !== "running") break
    }

    const done = result.state !== "running"
    const text = done ? result.text : `Timed out after ${timeout}ms while waiting for task completion.`
    return {
      title: "Task status",
      metadata: {
        task_id: params.task_id,
        state: result.state,
        timed_out: !done,
      },
      output: format({ taskID: params.task_id, state: result.state, text }),
    }
  },
})
