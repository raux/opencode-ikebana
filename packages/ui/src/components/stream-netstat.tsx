import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js"
import type { AssistantMessage, Part, StepFinishPart, TextPart } from "@opencode-ai/sdk/v2/client"
import { useI18n } from "../context/i18n"
import { Tooltip } from "./tooltip"
import { TextShimmer } from "./text-shimmer"

function port(url: string | undefined) {
  if (!url) return
  try {
    const parsed = new URL(url)
    const value = parsed.port || (parsed.protocol === "https:" ? "443" : "80")
    return value
  } catch {
    return
  }
}

function tokens(msg: AssistantMessage) {
  return {
    input: msg.tokens.input,
    output: msg.tokens.output,
    reasoning: msg.tokens.reasoning,
    cacheRead: msg.tokens.cache.read,
    cacheWrite: msg.tokens.cache.write,
    total:
      msg.tokens.input + msg.tokens.output + msg.tokens.reasoning + msg.tokens.cache.read + msg.tokens.cache.write,
  }
}

function ttft(msg: AssistantMessage, parts: Part[]) {
  const first = parts.find((p): p is TextPart => p.type === "text" && !!p.time?.start)
  if (!first?.time?.start) return
  const delta = first.time.start - msg.time.created
  return delta > 0 ? delta : undefined
}

function rate(output: number, ms: number) {
  if (ms <= 0 || output <= 0) return
  return Math.round(output / (ms / 1000))
}

function elapsed(created: number) {
  const ms = Date.now() - created
  return ms > 0 ? ms : 0
}

function fmt(ms: number) {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rest = Math.round(s % 60)
  return `${m}m ${rest}s`
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value)
}

export function StreamNetstat(props: {
  message: AssistantMessage | undefined
  parts: Part[]
  working: boolean
  serverUrl?: string
}) {
  const i18n = useI18n()
  const [tick, setTick] = createSignal(0)

  createEffect(
    on(
      () => props.working,
      (busy) => {
        if (!busy) return
        const timer = setInterval(() => setTick((n) => n + 1), 100)
        onCleanup(() => clearInterval(timer))
      },
    ),
  )

  const streaming = createMemo(() => props.working && !!props.message && !props.message.time.completed)

  const stats = createMemo(() => {
    const msg = props.message
    if (!msg) return

    const _ = tick()

    if (streaming()) {
      const ms = elapsed(msg.time.created)
      const steps = props.parts.filter((p): p is StepFinishPart => p.type === "step-finish")
      const last = steps.at(-1)
      const output = last ? last.tokens.output : 0
      const total = last
        ? last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
        : 0
      return {
        state: "streaming" as const,
        elapsed: ms,
        port: port(props.serverUrl),
        opened: msg.time.created,
        tokens: total,
        output,
        rate: rate(output, ms),
        cost: msg.cost,
        ttft: ttft(msg, props.parts),
      }
    }

    if (msg.time.completed) {
      const t = tokens(msg)
      const ms = msg.time.completed - msg.time.created
      return {
        state: "completed" as const,
        elapsed: ms,
        port: port(props.serverUrl),
        opened: msg.time.created,
        tokens: t.total,
        output: t.output,
        rate: rate(t.output, ms),
        cost: msg.cost,
        ttft: ttft(msg, props.parts),
        breakdown: t,
      }
    }
  })

  const label = createMemo(() => {
    const s = stats()
    if (!s) return
    const items: string[] = []

    if (s.port) items.push(i18n.t("ui.netstat.port", { port: s.port }))

    items.push(fmt(s.elapsed))

    if (s.tokens > 0)
      items.push(i18n.t("ui.netstat.tokens", { count: s.tokens.toLocaleString() }))

    if (s.rate)
      items.push(i18n.t("ui.netstat.rate", { rate: String(s.rate) }))

    if (s.state === "completed" && s.cost > 0) items.push(money(s.cost))

    return items.join(" · ")
  })

  const opened = createMemo(() => {
    const s = stats()
    if (!s) return
    return new Date(s.opened).toLocaleTimeString()
  })

  const detail = createMemo(() => {
    const s = stats()
    if (!s) return
    const lines: string[] = []

    if (s.port) lines.push(`${i18n.t("ui.netstat.detail.port")}: ${s.port}`)
    lines.push(`${i18n.t("ui.netstat.detail.opened")}: ${new Date(s.opened).toLocaleTimeString()}`)
    lines.push(`${i18n.t("ui.netstat.detail.elapsed")}: ${fmt(s.elapsed)}`)

    if (s.ttft !== undefined) lines.push(`${i18n.t("ui.netstat.detail.ttft")}: ${fmt(s.ttft)}`)

    if (s.state === "completed" && "breakdown" in s && s.breakdown) {
      lines.push(`${i18n.t("ui.netstat.detail.input")}: ${s.breakdown.input.toLocaleString()}`)
      lines.push(`${i18n.t("ui.netstat.detail.output")}: ${s.breakdown.output.toLocaleString()}`)
      if (s.breakdown.reasoning > 0)
        lines.push(`${i18n.t("ui.netstat.detail.reasoning")}: ${s.breakdown.reasoning.toLocaleString()}`)
      if (s.breakdown.cacheRead > 0)
        lines.push(`${i18n.t("ui.netstat.detail.cacheRead")}: ${s.breakdown.cacheRead.toLocaleString()}`)
      if (s.breakdown.cacheWrite > 0)
        lines.push(`${i18n.t("ui.netstat.detail.cacheWrite")}: ${s.breakdown.cacheWrite.toLocaleString()}`)
    } else if (s.tokens > 0) {
      lines.push(`${i18n.t("ui.netstat.detail.totalTokens")}: ${s.tokens.toLocaleString()}`)
    }

    if (s.rate) lines.push(`${i18n.t("ui.netstat.detail.rate")}: ${s.rate} tok/s`)
    if (s.cost > 0) lines.push(`${i18n.t("ui.netstat.detail.cost")}: ${money(s.cost)}`)

    return lines.join("\n")
  })

  return (
    <Show when={stats()}>
      <Show
        when={streaming()}
        fallback={
          <Show when={label()}>
            <Tooltip value={<pre data-slot="stream-netstat-detail">{detail()}</pre>} placement="top">
              <span data-component="stream-netstat" data-state="completed">
                {label()}
              </span>
            </Tooltip>
          </Show>
        }
      >
        <div data-component="stream-netstat" data-state="streaming">
          <TextShimmer text={i18n.t("ui.netstat.streaming")} />
          <Tooltip value={<pre data-slot="stream-netstat-detail">{detail()}</pre>} placement="top">
            <span data-slot="stream-netstat-label">{label()}</span>
          </Tooltip>
        </div>
      </Show>
    </Show>
  )
}
