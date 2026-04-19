// Phase 5.1 — Recursive Agent Tree view
// Tree visualization of parent → child agent relationships
import { RGBA } from "@opentui/core"
import { For, Show } from "solid-js"

export type AgentNode = {
  id: string
  label: string
  color: RGBA
  state: "idle" | "working" | "error" | "compacting"
  tokens: number
  cost: number
  children: AgentNode[]
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

function stateIcon(state: AgentNode["state"]): string {
  if (state === "working") return "●"
  if (state === "error") return "✗"
  if (state === "compacting") return "◐"
  return "○"
}

function TreeNode(props: {
  node: AgentNode
  prefix: string
  last: boolean
  root: boolean
  theme: { text: RGBA; textMuted: RGBA; success: RGBA; error: RGBA; warning: RGBA }
}) {
  const connector = () => (props.root ? "" : props.last ? "└── " : "├── ")
  const child = () => (props.root ? "" : props.last ? "    " : "│   ")

  const stateColor = () => {
    if (props.node.state === "working") return props.theme.success
    if (props.node.state === "error") return props.theme.error
    if (props.node.state === "compacting") return props.theme.warning
    return props.theme.textMuted
  }

  return (
    <box>
      <text wrapMode="none">
        <span style={{ fg: props.theme.textMuted }}>
          {props.prefix}
          {connector()}
        </span>
        <span style={{ fg: stateColor() }}>{stateIcon(props.node.state)} </span>
        <span style={{ fg: props.node.color }}>
          <b>{props.node.label}</b>
        </span>
        <Show when={props.node.tokens > 0}>
          <span style={{ fg: props.theme.textMuted }}>
            {" "}
            {props.node.tokens.toLocaleString()} tok {money.format(props.node.cost)}
          </span>
        </Show>
      </text>
      <For each={props.node.children}>
        {(child_, i) => (
          <TreeNode
            node={child_}
            prefix={props.prefix + child()}
            last={i() === props.node.children.length - 1}
            root={false}
            theme={props.theme}
          />
        )}
      </For>
    </box>
  )
}

export function AgentTree(props: {
  root: AgentNode
  theme: { text: RGBA; textMuted: RGBA; success: RGBA; error: RGBA; warning: RGBA }
}) {
  return (
    <box>
      <text fg={props.theme.text}>
        <b>Agent Tree</b>
      </text>
      <TreeNode node={props.root} prefix="" last={true} root={true} theme={props.theme} />
    </box>
  )
}
