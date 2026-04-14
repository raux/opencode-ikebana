import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { Log } from "../util/log"
import path from "path"
import fs from "fs/promises"
import { Global } from "../global"

const log = Log.create({ service: "plugin.tokenlog" })

type Entry = {
  ts: string
  sessionID: string
  messageID: string
  agent: string
  providerID: string
  modelID: string
  cost: number
  tokens: {
    input: number
    output: number
    reasoning: number
    cache: { read: number; write: number }
  }
}

// In-memory cache of assistant message metadata keyed by messageID
const messages = new Map<
  string,
  {
    sessionID: string
    agent: string
    providerID: string
    modelID: string
  }
>()

function dir() {
  return path.join(Global.Path.data, "tokenlog")
}

function file() {
  return path.join(dir(), "tokens.jsonl")
}

async function clear(): Promise<void> {
  const p = file()
  try {
    await fs.access(p)
    await fs.unlink(p)
    log.info("token logs cleared")
  } catch (err) {
    if (err instanceof Error && err.message !== "ENOENT") {
      log.error("failed to clear token logs", { error: err })
    }
  }
}

async function append(entry: Entry) {
  await fs.mkdir(dir(), { recursive: true })
  await fs.appendFile(file(), JSON.stringify(entry) + "\n")
}

async function read(): Promise<Entry[]> {
  const p = file()
  const exists = await fs.access(p).then(
    () => true,
    () => false,
  )
  if (!exists) return []
  const text = await fs.readFile(p, "utf-8")
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Entry)
}

function sum(tokens: Entry["tokens"]) {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

type Aggregate = { tokens: Entry["tokens"]; cost: number; calls: number }

function aggregate(grouped: Map<string, Aggregate>, key: string, entry: Entry) {
  const existing = grouped.get(key)
  if (existing) {
    existing.tokens.input += entry.tokens.input
    existing.tokens.output += entry.tokens.output
    existing.tokens.reasoning += entry.tokens.reasoning
    existing.tokens.cache.read += entry.tokens.cache.read
    existing.tokens.cache.write += entry.tokens.cache.write
    existing.cost += entry.cost
    existing.calls++
  } else {
    grouped.set(key, {
      tokens: { ...entry.tokens, cache: { ...entry.tokens.cache } },
      cost: entry.cost,
      calls: 1,
    })
  }
}

function section(title: string, grouped: Map<string, Aggregate>) {
  const lines: string[] = []
  lines.push(`${title}:`)
  lines.push("-".repeat(40))
  for (const [name, data] of grouped) {
    lines.push(`  ${name}: ${sum(data.tokens).toLocaleString()} tokens, $${data.cost.toFixed(4)}, ${data.calls} calls`)
    lines.push(
      `    input=${data.tokens.input.toLocaleString()} output=${data.tokens.output.toLocaleString()} reasoning=${data.tokens.reasoning.toLocaleString()} cache_read=${data.tokens.cache.read.toLocaleString()} cache_write=${data.tokens.cache.write.toLocaleString()}`,
    )
  }
  return lines
}

function format(entries: Entry[]) {
  if (!entries.length) return "No token usage logged yet."

  const agents = new Map<string, Aggregate>()
  const models = new Map<string, Aggregate>()
  for (const e of entries) {
    aggregate(agents, e.agent, e)
    aggregate(models, `${e.providerID}/${e.modelID}`, e)
  }

  const total = entries.reduce(
    (acc, e) => {
      acc.input += e.tokens.input
      acc.output += e.tokens.output
      acc.reasoning += e.tokens.reasoning
      acc.cache.read += e.tokens.cache.read
      acc.cache.write += e.tokens.cache.write
      acc.cost += e.cost
      return acc
    },
    { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 }, cost: 0 },
  )

  const lines: string[] = []
  lines.push(`Token Usage Report (${entries.length} API calls)`)
  lines.push("=".repeat(60))
  lines.push("")
  lines.push(...section("By Agent", agents))
  lines.push("")
  lines.push(...section("By Model", models))
  lines.push("")
  lines.push(`Total: ${sum(total).toLocaleString()} tokens, $${total.cost.toFixed(4)}`)

  return lines.join("\n")
}

// Bus event payload shape. The SDK Event type doesn't expose typed
// properties per event, so we use a lightweight accessor.
function props(event: Record<string, unknown>) {
  return (event as { properties?: Record<string, unknown> }).properties
}

export async function TokenLogPlugin(_input: PluginInput): Promise<Hooks> {
  log.info("tokenlog plugin loaded")

  return {
    async event({ event }) {
      const p = props(event as Record<string, unknown>)
      if (!p) return

      // Track assistant messages for metadata correlation
      if (event.type === "message.updated") {
        const info = p.info as Record<string, string> | undefined
        if (info?.role === "assistant") {
          messages.set(info.id, {
            sessionID: info.sessionID,
            agent: info.agent,
            providerID: info.providerID,
            modelID: info.modelID,
          })
        }
      }

      // Log token usage from step-finish parts
      if (event.type === "message.part.updated") {
        const part = p.part as Record<string, unknown> | undefined
        if (part?.type !== "step-finish") return
        const meta = messages.get(part.messageID as string)
        if (!meta) {
          log.warn("step-finish without matching assistant message", { messageID: part.messageID as string })
          return
        }

        const entry: Entry = {
          ts: new Date().toISOString(),
          sessionID: meta.sessionID,
          messageID: part.messageID as string,
          agent: meta.agent,
          providerID: meta.providerID,
          modelID: meta.modelID,
          cost: part.cost as number,
          tokens: part.tokens as Entry["tokens"],
        }

        log.info("token usage", {
          agent: entry.agent,
          model: `${entry.providerID}/${entry.modelID}`,
          input: entry.tokens.input,
          output: entry.tokens.output,
          cost: entry.cost,
        })

        await append(entry).catch((err) => log.error("failed to write token log", { error: err }))
      }
    },

    tool: {
      tokenlog: tool({
        description: "Display token usage report.",
        args: {},
        async execute() {
          const entries = await read()
          return format(entries)
        },
      }),
      tokenlogclear: tool({
        description: "Clear the token usage logs.",
        args: {},
        async execute() {
          await clear()
          return "Token usage logs cleared successfully."
        },
      }),
    },
  }
}
