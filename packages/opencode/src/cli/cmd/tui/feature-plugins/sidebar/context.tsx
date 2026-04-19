import type { AssistantMessage, ToolPart } from "@opencode-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo, For, Show } from "solid-js"
import path from "path"

const id = "internal:sidebar-context"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function extractPath(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined
  const obj = input as Record<string, unknown>
  const raw = obj.filePath ?? obj.path ?? obj.pattern
  if (typeof raw !== "string") return undefined
  return raw
}

function basename(fp: string): string {
  return path.basename(fp)
}

const READ_TOOLS = new Set(["read"])
const WRITE_TOOLS = new Set(["write", "edit"])
const EXPLORE_TOOLS = new Set(["glob", "grep"])

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))

  // --- Context section: total tokens, cost, % used ---
  const totals = createMemo(() => {
    let tokens = 0
    let cost = 0
    for (const m of msg()) {
      if (m.role !== "assistant") continue
      tokens += m.tokens.input + m.tokens.output + m.tokens.reasoning + m.tokens.cache.read + m.tokens.cache.write
      cost += m.cost
    }
    return { tokens, cost }
  })

  const percent = createMemo(() => {
    const last = msg().findLast((m): m is AssistantMessage => m.role === "assistant" && m.tokens.output > 0)
    if (!last) return null
    const tok =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = props.api.state.provider.find((p) => p.id === last.providerID)?.models[last.modelID]
    return model?.limit.context ? Math.round((tok / model.limit.context) * 100) : null
  })

  // --- Tool calls tally ---
  const parts = createMemo(() => {
    const all: ToolPart[] = []
    for (const m of msg()) {
      const ps = props.api.state.part(m.id)
      for (const p of ps) {
        if (p.type === "tool") all.push(p as ToolPart)
      }
    }
    return all
  })

  const tally = createMemo(() => {
    const counts = new Map<string, number>()
    for (const p of parts()) {
      counts.set(p.tool, (counts.get(p.tool) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  })

  // --- File stats ---
  const files = createMemo(() => {
    const read = new Set<string>()
    const written = new Set<string>()
    const explored = new Set<string>()

    for (const p of parts()) {
      const fp = extractPath(p.state.input)
      if (!fp) continue
      if (READ_TOOLS.has(p.tool)) read.add(fp)
      if (WRITE_TOOLS.has(p.tool)) written.add(fp)
      if (EXPLORE_TOOLS.has(p.tool)) explored.add(fp)
    }

    return {
      read: [...read],
      written: [...written],
      explored: [...explored],
    }
  })

  return (
    <box gap={1}>
      {/* Context */}
      <box>
        <text fg={theme().text}>
          <b>Context</b>
        </text>
        <text fg={theme().textMuted}>
          {totals().tokens.toLocaleString()} tokens · {percent() ?? 0}% used
        </text>
        <text fg={theme().textMuted}>{money.format(totals().cost)} total cost</text>
      </box>

      {/* Tool Calls */}
      <Show when={tally().length > 0}>
        <box>
          <text fg={theme().text}>
            <b>Tool Calls</b>
          </text>
          <For each={tally()}>
            {([name, count]) => (
              <text fg={theme().textMuted}>
                {"  "}
                {name.padEnd(14)}
                {String(count).padStart(4)}
              </text>
            )}
          </For>
        </box>
      </Show>

      {/* Files */}
      <Show when={files().read.length + files().written.length + files().explored.length > 0}>
        <box>
          <text fg={theme().text}>
            <b>Files</b>{" "}
            <span style={{ fg: theme().textMuted }}>
              {files().read.length} read · {files().written.length} written · {files().explored.length} explored
            </span>
          </text>
          <Show when={files().read.length > 0}>
            <text fg={theme().textMuted}>
              {"  "}read: {files().read.map(basename).join(", ")}
            </text>
          </Show>
          <Show when={files().written.length > 0}>
            <text fg={theme().textMuted}>
              {"  "}written: {files().written.map(basename).join(", ")}
            </text>
          </Show>
          <Show when={files().explored.length > 0}>
            <text fg={theme().textMuted}>
              {"  "}explored: {files().explored.map(basename).join(", ")}
            </text>
          </Show>
        </box>
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
