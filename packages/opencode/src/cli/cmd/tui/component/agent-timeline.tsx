// Phase 5.2 — Agent State Timeline
// Per-agent horizontal timeline showing active/idle periods
import { RGBA } from "@opentui/core"
import { For, Show } from "solid-js"

export type TimelineEntry = {
  label: string
  color: RGBA
  segments: ("active" | "idle")[]
}

const ACTIVE = "█"
const IDLE = "░"

export function AgentTimeline(props: { entries: TimelineEntry[]; theme: { text: RGBA; textMuted: RGBA } }) {
  return (
    <Show when={props.entries.length > 0}>
      <box>
        <text fg={props.theme.text}>
          <b>Timeline</b>
        </text>
        <For each={props.entries}>
          {(entry) => (
            <text wrapMode="none">
              {"  "}
              <span style={{ fg: entry.color }}>{entry.label.padEnd(10)}</span>
              {entry.segments.map((s) => (
                <span style={{ fg: s === "active" ? entry.color : props.theme.textMuted }}>
                  {s === "active" ? ACTIVE : IDLE}
                </span>
              ))}
            </text>
          )}
        </For>
      </box>
    </Show>
  )
}

// Build timeline segments from session start/end times
export function buildTimeline(
  agents: { label: string; color: RGBA; start: number; end?: number }[],
  slots: number,
): TimelineEntry[] {
  if (!agents.length) return []
  const min = Math.min(...agents.map((a) => a.start))
  const max = Math.max(...agents.map((a) => a.end ?? Date.now()))
  const span = max - min || 1

  return agents.map((a) => {
    const segments: ("active" | "idle")[] = []
    for (let i = 0; i < slots; i++) {
      const t = min + (i / slots) * span
      const active = t >= a.start && t <= (a.end ?? Date.now())
      segments.push(active ? "active" : "idle")
    }
    return { label: a.label, color: a.color, segments }
  })
}
