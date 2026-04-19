// Phase 3.1 — Token Composition Bar
// Horizontal stacked bar showing input/output/reasoning/cache breakdown
import { RGBA } from "@opentui/core"
import type { TokenBreakdown } from "@tui/util/metrics"

const BLOCK = "█"
const WIDTH = 20

const COLORS = {
  input: "#5c9cf5",
  output: "#7fd88f",
  reasoning: "#9d7cd8",
  cacheRead: "#56b6c2",
  cacheWrite: "#e5c07b",
}

export function TokenBar(props: { breakdown: TokenBreakdown; theme: { textMuted: RGBA; text: RGBA } }) {
  const segments = () => {
    const t = props.breakdown.total
    if (t === 0) return []
    const b = props.breakdown
    return [
      { label: "in", value: b.input, ratio: b.input / t, color: COLORS.input },
      { label: "out", value: b.output, ratio: b.output / t, color: COLORS.output },
      { label: "reas", value: b.reasoning, ratio: b.reasoning / t, color: COLORS.reasoning },
      { label: "c.rd", value: b.cacheRead, ratio: b.cacheRead / t, color: COLORS.cacheRead },
      { label: "c.wr", value: b.cacheWrite, ratio: b.cacheWrite / t, color: COLORS.cacheWrite },
    ].filter((s) => s.value > 0)
  }

  const blocks = () => {
    const segs = segments()
    let remaining = WIDTH
    return segs.map((s, i) => {
      const w = i === segs.length - 1 ? remaining : Math.max(1, Math.round(s.ratio * WIDTH))
      const clamped = Math.min(w, remaining)
      remaining -= clamped
      return { ...s, width: clamped }
    })
  }

  return (
    <box>
      <text fg={props.theme.text}>
        <b>Tokens</b> <span style={{ fg: props.theme.textMuted }}>{props.breakdown.total.toLocaleString()}</span>
      </text>
      <text wrapMode="none">
        {blocks().map((b) => (
          <span style={{ fg: RGBA.fromHex(b.color) }}>{BLOCK.repeat(b.width)}</span>
        ))}
      </text>
      <text fg={props.theme.textMuted}>
        {"  "}
        {segments()
          .map((s) => `${s.label} ${s.value.toLocaleString()}`)
          .join(" · ")}
      </text>
    </box>
  )
}
