import { createMemo, For, Show } from "solid-js"
import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"
import { useLocal } from "@tui/context/local"
import { Locale } from "@/util/locale"
import { Spinner } from "./spinner"
import type { ToolPart, Session, Message } from "@opencode-ai/sdk/v2"
import { RGBA } from "@opentui/core"

const SUBAGENT_COLORS = [
  "#5c9cf5", // blue
  "#9d7cd8", // purple
  "#56b6c2", // cyan
  "#f5a742", // orange
  "#7fd88f", // green
  "#e06c75", // red
  "#e5c07b", // yellow
  "#ff79c6", // pink
]

function subagentColor(index: number): RGBA {
  return RGBA.fromHex(SUBAGENT_COLORS[index % SUBAGENT_COLORS.length])
}

type AgentEntry = {
  session: Session
  color: RGBA
  label: string
  state: "idle" | "working" | "error" | "compacting"
  tool?: { name: string; title: string }
  error?: string
  duration: number
  tools: number
  tokens: number
  cost: number
}

export function AgentWorkflow(props: { sessionID: string }) {
  const sync = useSync()
  const { theme } = useTheme()
  const local = useLocal()

  const parent = createMemo(() => {
    const s = sync.session.get(props.sessionID)
    if (!s) return undefined
    return s.parentID ? sync.session.get(s.parentID) : s
  })

  const entries = createMemo((): AgentEntry[] => {
    const p = parent()
    if (!p) return []

    const children = sync.data.session
      .filter((x) => x.parentID === p.id)
      .toSorted((a, b) => a.time.created - b.time.created)

    const all: AgentEntry[] = []

    // Add parent session first
    all.push(entry(p, local.agent.color(extractAgent(p)), extractLabel(p)))

    // Add child sessions (subagents)
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      all.push(entry(child, subagentColor(i), extractLabel(child)))
    }

    return all
  })

  function entry(session: Session, color: RGBA, label: string): AgentEntry {
    const messages = sync.data.message[session.id] ?? []
    const state = deriveState(session, messages)
    const tool = activeTool(messages)
    const error = lastError(messages)
    const duration = elapsed(messages)
    const tools = countTools(messages)
    const usage = agentUsage(messages)

    return { session, color, label, state, tool, error, duration, tools, tokens: usage.tokens, cost: usage.cost }
  }

  function agentUsage(messages: Message[]): { tokens: number; cost: number } {
    let tokens = 0
    let cost = 0
    for (const msg of messages) {
      if (msg.role !== "assistant") continue
      tokens +=
        msg.tokens.input + msg.tokens.output + msg.tokens.reasoning + msg.tokens.cache.read + msg.tokens.cache.write
      cost += msg.cost
    }
    return { tokens, cost }
  }

  function deriveState(session: Session, messages: Message[]): AgentEntry["state"] {
    if (session.time.compacting) return "compacting"
    const last = messages.at(-1)
    if (!last) return "idle"
    if (last.role === "assistant" && last.error) return "error"
    if (last.role === "user") return "working"
    if (last.role === "assistant" && !last.time.completed) return "working"
    return "idle"
  }

  function activeTool(messages: Message[]): AgentEntry["tool"] {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      const parts = sync.data.part[msg.id] ?? []
      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j]
        if (part.type !== "tool") continue
        const tp = part as ToolPart
        if (tp.state.status === "running") {
          return {
            name: tp.tool,
            title: tp.state.title ?? "",
          }
        }
        if (tp.state.status === "pending") {
          return {
            name: tp.tool,
            title: "",
          }
        }
      }
    }
    return undefined
  }

  function lastError(messages: Message[]): string | undefined {
    const last = messages.findLast((x) => x.role === "assistant")
    if (!last) return undefined
    if (last.role !== "assistant" || !last.error) return undefined
    const data = last.error.data as Record<string, unknown> | undefined
    return (data?.message as string) ?? last.error.name
  }

  function elapsed(messages: Message[]): number {
    const first = messages.find((x) => x.role === "user")
    if (!first) return 0
    const last = messages.findLast((x) => x.role === "assistant")
    if (!last) return 0
    if (last.role !== "assistant" || !last.time.completed) return 0
    return last.time.completed - first.time.created
  }

  function countTools(messages: Message[]): number {
    let count = 0
    for (const msg of messages) {
      const parts = sync.data.part[msg.id] ?? []
      for (const part of parts) {
        if (part.type === "tool") count++
      }
    }
    return count
  }

  function extractAgent(session: Session): string {
    const match = session.title.match(/@(\w+)/)
    return match ? match[1] : "code"
  }

  function extractLabel(session: Session): string {
    if (!session.parentID) return Locale.titlecase(extractAgent(session))
    const match = session.title.match(/@(\w+) subagent/)
    return match ? Locale.titlecase(match[1]) : "Subagent"
  }

  function stateIcon(state: AgentEntry["state"]): string {
    switch (state) {
      case "working":
        return "●"
      case "error":
        return "✗"
      case "compacting":
        return "◐"
      case "idle":
        return "○"
    }
  }

  function stateColor(state: AgentEntry["state"]): RGBA {
    switch (state) {
      case "working":
        return theme.success
      case "error":
        return theme.error
      case "compacting":
        return theme.warning
      case "idle":
        return theme.textMuted
    }
  }

  return (
    <Show when={entries().length > 0}>
      <box gap={0}>
        <text fg={theme.textMuted}>
          <b>Workflow</b>
        </text>
        <For each={entries()}>
          {(agent) => (
            <box paddingTop={1}>
              <Show
                when={agent.state === "working"}
                fallback={
                  <text wrapMode="none">
                    <span style={{ fg: stateColor(agent.state) }}>{stateIcon(agent.state)}</span>{" "}
                    <span style={{ fg: agent.color }}>
                      <b>{agent.label}</b>
                    </span>
                    <Show when={agent.state === "idle" && agent.tools > 0}>
                      <span style={{ fg: theme.textMuted }}>
                        {" "}
                        · {agent.tools} calls · {Locale.duration(agent.duration)}
                      </span>
                    </Show>
                    <Show when={agent.state === "error" && agent.error}>
                      <span style={{ fg: theme.error }}> {agent.error}</span>
                    </Show>
                    <Show when={agent.state === "compacting"}>
                      <span style={{ fg: theme.warning }}> compacting…</span>
                    </Show>
                  </text>
                }
              >
                <Spinner color={agent.color}>
                  <span style={{ fg: agent.color }}>
                    <b>{agent.label}</b>
                  </span>
                  <Show when={agent.tool}>
                    {(t) => (
                      <span style={{ fg: theme.textMuted }}>
                        {" "}
                        {Locale.titlecase(t().name)}
                        <Show when={t().title}> {t().title}</Show>
                      </span>
                    )}
                  </Show>
                </Spinner>
              </Show>
              <Show when={!agent.session.parentID}>
                <text fg={theme.textMuted} paddingLeft={2}>
                  {agent.session.id.slice(0, 8)}
                  <Show when={agent.tokens > 0}>
                    {" "}
                    · {agent.tokens.toLocaleString()} tok · ${agent.cost.toFixed(4)}
                  </Show>
                </text>
              </Show>
              <Show when={agent.session.parentID}>
                <text fg={theme.textMuted} paddingLeft={2}>
                  ↳ {agent.session.id.slice(0, 8)}
                  <Show when={agent.tokens > 0}>
                    {" "}
                    · {agent.tokens.toLocaleString()} tok · ${agent.cost.toFixed(4)}
                  </Show>
                </text>
              </Show>
            </box>
          )}
        </For>
      </box>
    </Show>
  )
}
