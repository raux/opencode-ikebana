// Phase 2.2 — Segmented Phase Indicator
// Shows the current phase of the agent loop
import { RGBA } from "@opentui/core"

const PHASES = ["Prompt", "Think", "Tool", "Parse"] as const
type Phase = (typeof PHASES)[number]

export function PhaseIndicator(props: {
  phase: Phase | null
  theme: { text: RGBA; textMuted: RGBA; success: RGBA; warning: RGBA }
}) {
  return (
    <text wrapMode="none">
      {PHASES.map((p) => {
        const active = p === props.phase
        const fg = active ? props.theme.success : props.theme.textMuted
        const marker = active ? "▶" : "·"
        return (
          <>
            <span style={{ fg }}>
              {marker} {p}
            </span>
            {"  "}
          </>
        )
      })}
    </text>
  )
}

export function derivePhase(state: { working: boolean; tool?: { name: string } }): Phase | null {
  if (!state.working) return null
  if (state.tool) return "Tool"
  return "Think"
}
