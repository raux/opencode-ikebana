// Unicode chart rendering utilities for terminal UI

const SPARKLINE = "▁▂▃▄▅▆▇█"
const BLOCK_FULL = "█"
const BLOCK_LIGHT = "░"

export function sparkline(values: number[]): string {
  if (!values.length) return ""
  const max = Math.max(...values, 1)
  return values.map((v) => SPARKLINE[Math.min(Math.round((v / max) * 7), 7)]).join("")
}

export function bar(ratio: number, width: number): string {
  const clamped = Math.max(0, Math.min(1, ratio))
  const filled = Math.round(clamped * width)
  return BLOCK_FULL.repeat(filled) + BLOCK_LIGHT.repeat(width - filled)
}

export function stacked(segments: { ratio: number; char?: string }[], width: number): string {
  let remaining = width
  const chars: string[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const w = i === segments.length - 1 ? remaining : Math.round(seg.ratio * width)
    const clamped = Math.min(w, remaining)
    chars.push((seg.char ?? BLOCK_FULL).repeat(Math.max(0, clamped)))
    remaining -= clamped
  }
  return chars.join("")
}
