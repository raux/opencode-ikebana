// Phase 6.1 — Expandable Loop Detail Dialog
// Shows full details for a selected loop iteration
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { For, Show } from "solid-js"
import type { LoopIteration } from "@tui/util/metrics"

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

export function LoopDetailDialog(props: { api: TuiPluginApi; iterations: LoopIteration[]; onClose: () => void }) {
  const theme = () => props.api.theme.current

  return (
    <props.api.ui.Dialog size="large" onClose={props.onClose}>
      <box gap={1} paddingLeft={2} paddingRight={2} paddingTop={1}>
        <text fg={theme().text}>
          <b>Loop Iterations</b> <span style={{ fg: theme().textMuted }}>{props.iterations.length} steps</span>
        </text>
        <For each={props.iterations}>
          {(iter) => {
            const dur = () => (iter.start && iter.end ? `${iter.end - iter.start}ms` : "—")
            const fg = () => {
              if (iter.status === "completed") return theme().success
              if (iter.status === "error") return theme().error
              if (iter.status === "running") return theme().warning
              return theme().textMuted
            }
            return (
              <text wrapMode="none">
                <span style={{ fg: fg() }}>
                  {iter.status === "completed" ? "✓" : iter.status === "error" ? "✗" : "●"}
                </span>
                {"  "}
                <span style={{ fg: theme().text }}>{String(iter.index + 1).padStart(3)}.</span>
                {"  "}
                <span style={{ fg: theme().text }}>{iter.tool.padEnd(16)}</span>
                <span style={{ fg: theme().textMuted }}>{dur().padStart(8)}</span>
                <Show when={iter.title}>
                  <span style={{ fg: theme().textMuted }}>
                    {"  "}
                    {iter.title}
                  </span>
                </Show>
              </text>
            )
          }}
        </For>
      </box>
    </props.api.ui.Dialog>
  )
}
