// Phase 3.2 — Context Window Gauge
// A single-line progress bar that changes color as context fills up
import { RGBA } from "@opentui/core"

const FILLED = "█"
const EMPTY = "░"

export function ContextGauge(props: {
  percent: number | null
  limit: number
  theme: { success: RGBA; warning: RGBA; error: RGBA; textMuted: RGBA; text: RGBA }
}) {
  const pct = () => props.percent ?? 0
  const width = 20

  const color = () => {
    const p = pct()
    if (p >= 85) return props.theme.error
    if (p >= 60) return props.theme.warning
    return props.theme.success
  }

  const filled = () => Math.round((pct() / 100) * width)

  const label = () => {
    if (!props.limit) return `${pct()}%`
    const k = Math.round(props.limit / 1000)
    return `${pct()}% of ${k}k`
  }

  return (
    <box>
      <text fg={props.theme.text}>
        <b>Context Window</b>
      </text>
      <text wrapMode="none">
        <span style={{ fg: color() }}>{FILLED.repeat(filled())}</span>
        <span style={{ fg: props.theme.textMuted }}>{EMPTY.repeat(width - filled())}</span>
        <span style={{ fg: props.theme.textMuted }}> {label()}</span>
      </text>
    </box>
  )
}
