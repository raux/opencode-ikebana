// Agent metrics computation utilities
import type { AssistantMessage, Message, ToolPart } from "@opencode-ai/sdk/v2"

export type TokenBreakdown = {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  total: number
}

export type ModelUsage = {
  model: string
  provider: string
  tokens: number
  cost: number
  messages: number
  cacheRead: number
  cacheWrite: number
}

export type LoopIteration = {
  index: number
  tool: string
  status: "completed" | "error" | "running" | "pending"
  tokens: number
  cost: number
  start?: number
  end?: number
  title?: string
}

export type ToolTally = {
  name: string
  total: number
  success: number
  error: number
}

export function tokenBreakdown(messages: readonly Message[]): TokenBreakdown {
  let input = 0
  let output = 0
  let reasoning = 0
  let cacheRead = 0
  let cacheWrite = 0
  for (const m of messages) {
    if (m.role !== "assistant") continue
    input += m.tokens.input
    output += m.tokens.output
    reasoning += m.tokens.reasoning
    cacheRead += m.tokens.cache.read
    cacheWrite += m.tokens.cache.write
  }
  return {
    input,
    output,
    reasoning,
    cacheRead,
    cacheWrite,
    total: input + output + reasoning + cacheRead + cacheWrite,
  }
}

export function modelUsage(messages: readonly Message[]): ModelUsage[] {
  const map = new Map<string, ModelUsage>()
  for (const m of messages) {
    if (m.role !== "assistant") continue
    const key = `${m.providerID}:${m.modelID}`
    const prev = map.get(key)
    const tok = m.tokens.input + m.tokens.output + m.tokens.reasoning + m.tokens.cache.read + m.tokens.cache.write
    if (prev) {
      prev.tokens += tok
      prev.cost += m.cost
      prev.messages += 1
      prev.cacheRead += m.tokens.cache.read
      prev.cacheWrite += m.tokens.cache.write
    } else {
      map.set(key, {
        model: m.modelID,
        provider: m.providerID,
        tokens: tok,
        cost: m.cost,
        messages: 1,
        cacheRead: m.tokens.cache.read,
        cacheWrite: m.tokens.cache.write,
      })
    }
  }
  return [...map.values()].sort((a, b) => b.tokens - a.tokens)
}

export function loopIterations(parts: readonly ToolPart[]): LoopIteration[] {
  return parts.map((p, i) => {
    const start = "time" in p.state ? (p.state as { time: { start: number } }).time.start : undefined
    const end =
      p.state.status === "completed" || p.state.status === "error"
        ? (p.state as { time: { end: number } }).time.end
        : undefined
    const title = "title" in p.state ? (p.state as { title?: string }).title : undefined
    return {
      index: i,
      tool: p.tool,
      status: p.state.status,
      tokens: 0,
      cost: 0,
      start,
      end,
      title,
    }
  })
}

export function toolTally(parts: readonly ToolPart[]): ToolTally[] {
  const map = new Map<string, ToolTally>()
  for (const p of parts) {
    const prev = map.get(p.tool)
    if (prev) {
      prev.total += 1
      if (p.state.status === "completed") prev.success += 1
      if (p.state.status === "error") prev.error += 1
    } else {
      map.set(p.tool, {
        name: p.tool,
        total: 1,
        success: p.state.status === "completed" ? 1 : 0,
        error: p.state.status === "error" ? 1 : 0,
      })
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}
