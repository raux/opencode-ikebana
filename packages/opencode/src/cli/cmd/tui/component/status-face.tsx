import { createMemo, createSignal, onCleanup } from "solid-js"
import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"
import type { AssistantMessage, Message, Session } from "@opencode-ai/sdk/v2"
import type { RGBA } from "@opentui/core"

type Stage = "idle" | "working" | "error" | "compacting" | "timeout" | "context_full"

const faces: Record<Stage, string[]> = {
  idle: ["( ˘ᵕ˘ )", "( ˙꒳˙ )", "( ◡‿◡ )"],
  working: ["( •⌄• )✧", "( ◕‿◕ )", "( ≧◡≦ )"],
  error: ["( T_T )", "( ಠ_ಠ)", "( ╥﹏╥ )"],
  compacting: ["( ¬_¬)", "( ≖_≖)"],
  timeout: ["( ⊙_⊙)", "( °o° )", "  ⌛  "],
  context_full: ["( ｡•́︿•̀｡ )", "( 🤯 )", "( 💦 )"],
}

function color(stage: Stage, theme: { success: RGBA; error: RGBA; warning: RGBA; textMuted: RGBA }): RGBA {
  switch (stage) {
    case "working":
      return theme.success
    case "error":
      return theme.error
    case "timeout":
    case "compacting":
    case "context_full":
      return theme.warning
    case "idle":
      return theme.textMuted
  }
}

const TIMEOUT_MS = 30_000
const CONTEXT_THRESHOLD = 85

export function StatusFace(props: { sessionID: string }) {
  const sync = useSync()
  const { theme } = useTheme()
  const [frame, setFrame] = createSignal(0)

  const timer = setInterval(() => setFrame((n) => n + 1), 500)
  onCleanup(() => clearInterval(timer))

  const session = createMemo(() => sync.session.get(props.sessionID))
  const messages = createMemo(() => sync.data.message[props.sessionID] ?? [])

  const base = createMemo((): "idle" | "working" | "error" | "compacting" => {
    const s = session()
    if (!s) return "idle"
    if (s.time.compacting) return "compacting"
    const last = messages().at(-1)
    if (!last) return "idle"
    if (last.role === "assistant" && last.error) return "error"
    if (last.role === "user") return "working"
    if (last.role === "assistant" && !last.time.completed) return "working"
    return "idle"
  })

  const elapsed = createMemo(() => {
    if (base() !== "working") return 0
    const first = messages().find((m: Message) => m.role === "user")
    if (!first) return 0
    return Date.now() - first.time.created
  })

  const context = createMemo(() => {
    const last = messages().findLast(
      (m: Message): m is AssistantMessage => m.role === "assistant" && m.tokens.output > 0,
    )
    if (!last) return 0
    const tok =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = sync.data.provider.find((p) => p.id === last.providerID)?.models[last.modelID]
    const limit = model?.limit.context ?? 0
    if (!limit) return 0
    return Math.round((tok / limit) * 100)
  })

  const stage = createMemo((): Stage => {
    if (context() >= CONTEXT_THRESHOLD) return "context_full"
    if (base() === "working" && elapsed() > TIMEOUT_MS) return "timeout"
    return base()
  })

  const face = createMemo(() => {
    const arr = faces[stage()]
    return arr[frame() % arr.length]
  })

  return <text fg={color(stage(), theme)}>{face()}</text>
}
