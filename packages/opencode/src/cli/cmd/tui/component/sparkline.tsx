// Phase 4.1 — Sparkline component
// Unicode sparkline visualization of activity over time
import { RGBA } from "@opentui/core"
import { Show } from "solid-js"
import { sparkline } from "@tui/util/unicode-chart"

export function Sparkline(props: {
  values: number[]
  label: string
  theme: { text: RGBA; textMuted: RGBA; success: RGBA }
}) {
  const line = () => sparkline(props.values)

  return (
    <Show when={props.values.length > 1}>
      <text wrapMode="none">
        <span style={{ fg: props.theme.textMuted }}>{props.label} </span>
        <span style={{ fg: props.theme.success }}>{line()}</span>
      </text>
    </Show>
  )
}
