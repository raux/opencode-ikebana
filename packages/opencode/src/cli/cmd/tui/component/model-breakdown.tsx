// Phase 3.3 — Model Usage Breakdown
// Per-model table showing tokens, cost, message count
import { RGBA } from "@opentui/core"
import { For, Show } from "solid-js"
import type { ModelUsage } from "@tui/util/metrics"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function short(model: string): string {
  // Trim common prefixes and long suffixes for display
  const parts = model.split("/")
  const name = parts[parts.length - 1]
  return name.length > 20 ? name.slice(0, 18) + "…" : name
}

function cacheRatio(usage: ModelUsage): string {
  const input = usage.tokens - usage.cacheRead - usage.cacheWrite
  if (input <= 0) return ""
  const ratio = Math.round((usage.cacheRead / (usage.cacheRead + input)) * 100)
  return `${ratio}% cache`
}

export function ModelBreakdown(props: {
  models: ModelUsage[]
  active?: { provider: string; model: string }
  theme: { text: RGBA; textMuted: RGBA; success: RGBA }
}) {
  const total = () => {
    let tokens = 0
    let cost = 0
    let messages = 0
    for (const m of props.models) {
      tokens += m.tokens
      cost += m.cost
      messages += m.messages
    }
    return { tokens, cost, messages }
  }

  const isActive = (m: ModelUsage) =>
    props.active && m.provider === props.active.provider && m.model === props.active.model

  return (
    <Show when={props.models.length > 0}>
      <box>
        <text fg={props.theme.text}>
          <b>Model Usage</b>
        </text>
        <For each={props.models}>
          {(m) => (
            <text fg={isActive(m) ? props.theme.text : props.theme.textMuted} wrapMode="none">
              {"  "}
              {isActive(m) ? "▸ " : "  "}
              {short(m.model).padEnd(20)}
              {String(m.tokens.toLocaleString()).padStart(8)} tok
              {"  "}
              {money.format(m.cost).padStart(8)}
              {"  "}
              {String(m.messages).padStart(3)} msg
              <Show when={cacheRatio(m)}>
                {" · "}
                {cacheRatio(m)}
              </Show>
            </text>
          )}
        </For>
        <Show when={props.models.length > 1}>
          <text fg={props.theme.textMuted}>
            {"  "}
            {"─".repeat(50)}
          </text>
          <text fg={props.theme.text} wrapMode="none">
            {"    "}
            {"total".padEnd(20)}
            {String(total().tokens.toLocaleString()).padStart(8)} tok
            {"  "}
            {money.format(total().cost).padStart(8)}
            {"  "}
            {String(total().messages).padStart(3)} msg
          </text>
        </Show>
      </box>
    </Show>
  )
}
