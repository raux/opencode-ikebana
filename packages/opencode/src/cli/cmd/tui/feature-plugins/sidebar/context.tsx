import type { AssistantMessage, ToolPart } from "@opencode-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createEffect, createMemo, For, Show } from "solid-js"
import path from "path"
import { tokenBreakdown, modelUsage, toolTally, loopIterations } from "@tui/util/metrics"
import { sparkline } from "@tui/util/unicode-chart"
import { ContextGauge } from "@tui/component/context-gauge"
import { TokenBar } from "@tui/component/token-bar"
import { ModelBreakdown } from "@tui/component/model-breakdown"
import { LoopTrail } from "@tui/component/loop-trail"
import { Sparkline } from "@tui/component/sparkline"
import { bar } from "@tui/util/unicode-chart"
import { checkBudget } from "@tui/component/budget-alert"

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

  // --- Budget alert ---
  createEffect(() => {
    const b = tokenBreakdown(msg())
    if (b.total > 0)
      checkBudget(
        props.api,
        modelUsage(msg()).reduce((s, m) => s + m.cost, 0),
      )
  })

  // --- Token breakdown ---
  const breakdown = createMemo(() => tokenBreakdown(msg()))

  // --- Context window % ---
  const context = createMemo(() => {
    const last = msg().findLast((m): m is AssistantMessage => m.role === "assistant" && m.tokens.output > 0)
    if (!last) return { percent: null, limit: 0, active: undefined }
    const tok =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = props.api.state.provider.find((p) => p.id === last.providerID)?.models[last.modelID]
    const limit = model?.limit.context ?? 0
    const percent = limit ? Math.round((tok / limit) * 100) : null
    return { percent, limit, active: { provider: last.providerID, model: last.modelID } }
  })

  // --- Model usage ---
  const models = createMemo(() => modelUsage(msg()))

  // --- Tool parts ---
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

  // --- Enhanced tool tally with success/error rates ---
  const tally = createMemo(() => toolTally(parts()))

  // --- Loop trail ---
  const iterations = createMemo(() => loopIterations(parts()))

  // --- Activity sparkline (tool calls per assistant message) ---
  const activity = createMemo(() => {
    const vals: number[] = []
    for (const m of msg()) {
      if (m.role !== "assistant") continue
      const ps = props.api.state.part(m.id)
      vals.push(ps.filter((p) => p.type === "tool").length)
    }
    return vals
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
      {/* Phase 3.2 — Context Window Gauge */}
      <ContextGauge percent={context().percent} limit={context().limit} theme={theme()} />

      {/* Phase 3.1 — Token Composition Bar */}
      <Show when={breakdown().total > 0}>
        <TokenBar breakdown={breakdown()} theme={theme()} />
      </Show>

      {/* Phase 3.3 — Model Usage Breakdown */}
      <ModelBreakdown models={models()} active={context().active} theme={theme()} />

      {/* Phase 2.1 — Loop Trail */}
      <LoopTrail iterations={iterations()} theme={theme()} />

      {/* Phase 4.1 — Activity Sparkline */}
      <Sparkline values={activity()} label="Activity" theme={theme()} />

      {/* Phase 4.2 — Enhanced Tool Tally */}
      <Show when={tally().length > 0}>
        <box>
          <text fg={theme().text}>
            <b>Tool Calls</b>
          </text>
          <For each={tally()}>
            {(t) => {
              const rate = () => (t.total > 0 ? Math.round((t.success / t.total) * 100) : 0)
              const w = 10
              const filled = () => Math.round((rate() / 100) * w)
              return (
                <text fg={theme().textMuted} wrapMode="none">
                  {"  "}
                  {t.name.padEnd(14)}
                  {String(t.total).padStart(4)}
                  {"  "}
                  <span style={{ fg: t.error > 0 ? theme().error : theme().success }}>{bar(rate() / 100, w)}</span>{" "}
                  {rate()}%
                </text>
              )
            }}
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
