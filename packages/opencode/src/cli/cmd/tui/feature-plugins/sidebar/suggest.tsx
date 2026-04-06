import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo, createSignal, onCleanup } from "solid-js"

const id = "internal:sidebar-suggest"

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const debug = createMemo(
    () =>
      (props.api.state.session as any).suggestDebug(props.session_id) as
        | { state: string; detail?: string; time: number }
        | undefined,
  )

  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(timer))

  const age = createMemo(() => {
    const d = debug()
    if (!d) return ""
    const ms = now() - d.time
    if (ms < 1000) return "just now"
    return `${Math.floor(ms / 1000)}s ago`
  })

  const color = createMemo(() => {
    const state = debug()?.state
    if (state === "generating") return theme().brand
    if (state === "done") return theme().textSuccess ?? "green"
    if (state === "error") return theme().textDanger ?? "red"
    if (state === "refused") return theme().textWarning ?? "yellow"
    return theme().textMuted
  })

  return (
    <box>
      <text fg={theme().text}>
        <b>Suggest</b>
      </text>
      {debug() ? (
        <>
          <text fg={color()}>
            {debug()!.state} {age()}
          </text>
          {debug()!.detail ? <text fg={theme().textMuted}>{debug()!.detail!.slice(0, 38)}</text> : null}
        </>
      ) : (
        <text fg={theme().textMuted}>waiting</text>
      )}
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 50,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
