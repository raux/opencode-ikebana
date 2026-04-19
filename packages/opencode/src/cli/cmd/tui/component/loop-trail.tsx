// Phase 2.1 — Breadcrumb Loop Trail
// Horizontal chain of unicode nodes representing each loop iteration
import { RGBA } from "@opentui/core"
import { For, Show } from "solid-js"
import type { LoopIteration } from "@tui/util/metrics"

const TOOL_ICONS: Record<string, string> = {
  read: "📄",
  write: "✏",
  edit: "✏",
  bash: "⌘",
  glob: "🔍",
  grep: "🔍",
  task: "◆",
  webfetch: "⊕",
}

function icon(tool: string): string {
  return TOOL_ICONS[tool] ?? "●"
}

function statusColor(status: string, theme: { success: RGBA; error: RGBA; warning: RGBA; textMuted: RGBA }): RGBA {
  if (status === "completed") return theme.success
  if (status === "error") return theme.error
  if (status === "running") return theme.warning
  return theme.textMuted
}

export function LoopTrail(props: {
  iterations: LoopIteration[]
  theme: { text: RGBA; textMuted: RGBA; success: RGBA; error: RGBA; warning: RGBA }
}) {
  // Show compact trail for long sequences, full for short
  const compact = () => props.iterations.length > 15

  const display = () => {
    if (compact()) {
      // Show first 5, ellipsis, last 5
      const items = props.iterations
      return [...items.slice(0, 5), null, ...items.slice(-5)]
    }
    return props.iterations as (LoopIteration | null)[]
  }

  return (
    <Show when={props.iterations.length > 0}>
      <box>
        <text fg={props.theme.text}>
          <b>Loop Trail</b> <span style={{ fg: props.theme.textMuted }}>{props.iterations.length} steps</span>
        </text>
        <text wrapMode="none">
          {"  "}
          <For each={display()}>
            {(iter, i) => (
              <>
                <Show when={iter === null}>
                  <span style={{ fg: props.theme.textMuted }}>···</span>
                </Show>
                <Show when={iter !== null}>
                  <span style={{ fg: statusColor(iter!.status, props.theme) }}>{icon(iter!.tool)}</span>
                </Show>
                <Show when={i() < display().length - 1}>
                  <span style={{ fg: props.theme.textMuted }}> → </span>
                </Show>
              </>
            )}
          </For>
          <span style={{ fg: props.theme.success }}> ✓</span>
        </text>
      </box>
    </Show>
  )
}
