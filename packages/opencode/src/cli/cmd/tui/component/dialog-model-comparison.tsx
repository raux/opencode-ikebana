// Phase 6.3 — Model Cost Comparison Overlay
// Dialog showing cost comparison across available models
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { For, Show } from "solid-js"

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

type ModelOption = {
  provider: string
  model: string
  cost: number
  tokens: number
  active: boolean
}

export function ModelComparisonDialog(props: { api: TuiPluginApi; models: ModelOption[]; onClose: () => void }) {
  const theme = () => props.api.theme.current

  return (
    <props.api.ui.Dialog size="large" onClose={props.onClose}>
      <box gap={1} paddingLeft={2} paddingRight={2} paddingTop={1}>
        <text fg={theme().text}>
          <b>Model Cost Comparison</b>
        </text>
        <text fg={theme().textMuted}>
          {"  "}
          {"Model".padEnd(24)}
          {"Tokens".padStart(10)}
          {"  "}
          {"Cost".padStart(10)}
        </text>
        <text fg={theme().textMuted}>
          {"  "}
          {"─".repeat(48)}
        </text>
        <For each={props.models}>
          {(m) => (
            <text wrapMode="none">
              {"  "}
              <Show when={m.active}>
                <span style={{ fg: theme().success }}>▸ </span>
              </Show>
              <Show when={!m.active}>
                <span>{"  "}</span>
              </Show>
              <span style={{ fg: m.active ? theme().text : theme().textMuted }}>
                {m.model.padEnd(22)}
                {m.tokens.toLocaleString().padStart(10)}
                {"  "}
                {money.format(m.cost).padStart(10)}
              </span>
            </text>
          )}
        </For>
      </box>
    </props.api.ui.Dialog>
  )
}
