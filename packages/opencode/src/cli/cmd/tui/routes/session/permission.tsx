import { createStore } from "solid-js/store"
import { createMemo, For, Match, Show, Switch } from "solid-js"
import { Portal, useKeyboard, useRenderer, useTerminalDimensions, type JSX } from "@opentui/solid"
import type { TextareaRenderable } from "@opentui/core"
import { useKeybind } from "../../context/keybind"
import { useTheme } from "../../context/theme"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import { useSDK } from "../../context/sdk"
import { SplitBorder } from "../../component/border"
import { useSync } from "../../context/sync"
import { useTextareaKeybindings } from "../../component/textarea-keybindings"
import path from "path"
import { LANGUAGE_EXTENSIONS } from "@/lsp/language"
import { Keybind } from "@/util/keybind"
import { Locale } from "@/util/locale"
import { Global } from "@/global"
import { useDialog } from "../../ui/dialog"
import { getScrollAcceleration } from "../../util/scroll"
import { useTuiConfig } from "../../context/tui-config"

type PermissionStage = "permission" | "reject"

function normalizePath(input?: string) {
  if (!input) return ""

  const cwd = process.cwd()
  const home = Global.Path.home
  const absolute = path.isAbsolute(input) ? input : path.resolve(cwd, input)
  const relative = path.relative(cwd, absolute)

  if (!relative) return "."
  if (!relative.startsWith("..")) return relative

  // outside cwd - use ~ or absolute
  if (home && (absolute === home || absolute.startsWith(home + path.sep))) {
    return absolute.replace(home, "~")
  }
  return absolute
}

function filetype(input?: string) {
  if (!input) return "none"
  const ext = path.extname(input)
  const language = LANGUAGE_EXTENSIONS[ext]
  if (["typescriptreact", "javascriptreact", "javascript"].includes(language)) return "typescript"
  return language
}

function EditBody(props: { request: PermissionRequest }) {
  const themeState = useTheme()
  const theme = themeState.theme
  const syntax = themeState.syntax
  const config = useTuiConfig()
  const dimensions = useTerminalDimensions()

  const filepath = createMemo(() => (props.request.metadata?.filepath as string) ?? "")
  const diff = createMemo(() => (props.request.metadata?.diff as string) ?? "")

  const view = createMemo(() => {
    const diffStyle = config.diff_style
    if (diffStyle === "stacked") return "unified"
    return dimensions().width > 120 ? "split" : "unified"
  })

  const ft = createMemo(() => filetype(filepath()))
  const scrollAcceleration = createMemo(() => getScrollAcceleration(config))

  return (
    <box flexDirection="column" gap={1}>
      <Show when={diff()}>
        <scrollbox
          height="100%"
          scrollAcceleration={scrollAcceleration()}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          <diff
            diff={diff()}
            view={view()}
            filetype={ft()}
            syntaxStyle={syntax()}
            showLineNumbers={true}
            width="100%"
            wrapMode="word"
            fg={theme.text}
            addedBg={theme.diffAddedBg}
            removedBg={theme.diffRemovedBg}
            contextBg={theme.diffContextBg}
            addedSignColor={theme.diffHighlightAdded}
            removedSignColor={theme.diffHighlightRemoved}
            lineNumberFg={theme.diffLineNumber}
            lineNumberBg={theme.diffContextBg}
            addedLineNumberBg={theme.diffAddedLineNumberBg}
            removedLineNumberBg={theme.diffRemovedLineNumberBg}
          />
        </scrollbox>
      </Show>
      <Show when={!diff()}>
        <box paddingLeft={1}>
          <text fg={theme.textMuted}>No diff provided</text>
        </box>
      </Show>
    </box>
  )
}

function preview(input?: string, limit: number = 6) {
  const text = input?.trim()
  if (!text) return ""
  let lines = 0
  let idx = 0
  while (idx < text.length) {
    if (text[idx] === "\n") lines += 1
    idx += 1
    if (lines >= limit) break
  }
  return idx >= text.length ? text : text.slice(0, idx).trimEnd()
}

function value(input: unknown) {
  return typeof input === "string" ? input : undefined
}

function note(dir?: string) {
  return dir ? `Allow always remembers access to ${dir} for this session.` : undefined
}

function ExternalBody(props: { file?: string; dir?: string; preview?: string; note?: string }) {
  const { theme } = useTheme()
  return (
    <box flexDirection="column" gap={1} paddingLeft={1}>
      <Show when={props.file}>
        <text fg={theme.textMuted}>{"File: " + props.file}</text>
      </Show>
      <Show when={props.dir}>
        <text fg={theme.textMuted}>{"Directory: " + props.dir}</text>
      </Show>
      <Show when={props.preview}>
        <box flexDirection="column" gap={1}>
          <text fg={theme.textMuted}>Preview</text>
          <box paddingLeft={1}>
            <text fg={theme.text}>{props.preview}</text>
          </box>
        </box>
      </Show>
      <Show when={props.note}>
        <text fg={theme.textMuted}>{props.note}</text>
      </Show>
    </box>
  )
}

function external(
  tool: string,
  data: Record<string, unknown>,
  file: string,
  dir: string,
): { icon: string; title: string; body: JSX.Element; fullscreen: false } {
  const body = (preview?: string) => <ExternalBody file={file} dir={dir} preview={preview} note={note(dir)} />

  if (tool === "write") {
    return {
      icon: "→",
      title: "Write file outside workspace",
      body: body(preview(value(data.content))),
      fullscreen: false,
    }
  }

  if (tool === "edit") {
    return {
      icon: "→",
      title: "Edit file outside workspace",
      body: body(preview(value(data.newString))),
      fullscreen: false,
    }
  }

  if (tool === "apply_patch") {
    return {
      icon: "→",
      title: "Apply patch outside workspace",
      body: body(preview(value(data.patchText))),
      fullscreen: false,
    }
  }

  if (tool === "read") {
    return {
      icon: "→",
      title: "Read file outside workspace",
      body: body(),
      fullscreen: false,
    }
  }

  return {
    icon: "←",
    title: `Access external directory ${dir}`,
    body: body(),
    fullscreen: false,
  }
}

export function PermissionPrompt(props: { request: PermissionRequest }) {
  const sdk = useSDK()
  const sync = useSync()
  const [store, setStore] = createStore({
    stage: "permission" as PermissionStage,
  })

  const session = createMemo(() => sync.data.session.find((s) => s.id === props.request.sessionID))
  const part = createMemo(() => {
    const tool = props.request.tool
    if (!tool) return
    return (sync.data.part[tool.messageID] ?? []).find((item) => item.type === "tool" && item.callID === tool.callID)
  })

  const input = createMemo(() => {
    const current = part()
    if (!current || current.type !== "tool") return {}
    return current.state.input ?? {}
  })

  const tool = createMemo(() => {
    const current = part()
    if (!current || current.type !== "tool") return ""
    return current.tool
  })

  const ext = createMemo(() => {
    const meta = props.request.metadata ?? {}
    const parent = value(meta["parentDir"])
    const filepath = value(meta["filepath"])
    const raw = value(input().filePath) ?? filepath
    const pattern = props.request.patterns?.[0]
    const derived = typeof pattern === "string" ? (pattern.includes("*") ? path.dirname(pattern) : pattern) : undefined
    return {
      file: normalizePath(raw),
      dir: normalizePath(parent ?? filepath ?? derived),
    }
  })

  const { theme } = useTheme()

  const info = createMemo(() => {
    const permission = props.request.permission
    const data = input()

    if (permission === "edit") {
      const raw = props.request.metadata?.filepath
      const filepath = typeof raw === "string" ? raw : ""
      return {
        icon: "→",
        title: `Edit ${normalizePath(filepath)}`,
        body: <EditBody request={props.request} />,
        fullscreen: true,
      }
    }

    if (permission === "read") {
      const raw = data.filePath
      const filePath = typeof raw === "string" ? raw : ""
      return {
        icon: "→",
        title: `Read ${normalizePath(filePath)}`,
        body: (
          <Show when={filePath}>
            <box paddingLeft={1}>
              <text fg={theme.textMuted}>{"Path: " + normalizePath(filePath)}</text>
            </box>
          </Show>
        ),
        fullscreen: false,
      }
    }

    if (permission === "glob") {
      const pattern = typeof data.pattern === "string" ? data.pattern : ""
      return {
        icon: "✱",
        title: `Glob "${pattern}"`,
        body: (
          <Show when={pattern}>
            <box paddingLeft={1}>
              <text fg={theme.textMuted}>{"Pattern: " + pattern}</text>
            </box>
          </Show>
        ),
        fullscreen: false,
      }
    }

    if (permission === "grep") {
      const pattern = typeof data.pattern === "string" ? data.pattern : ""
      return {
        icon: "✱",
        title: `Grep "${pattern}"`,
        body: (
          <Show when={pattern}>
            <box paddingLeft={1}>
              <text fg={theme.textMuted}>{"Pattern: " + pattern}</text>
            </box>
          </Show>
        ),
        fullscreen: false,
      }
    }

    if (permission === "list") {
      const raw = data.path
      const dir = typeof raw === "string" ? raw : ""
      return {
        icon: "→",
        title: `List ${normalizePath(dir)}`,
        body: (
          <Show when={dir}>
            <box paddingLeft={1}>
              <text fg={theme.textMuted}>{"Path: " + normalizePath(dir)}</text>
            </box>
          </Show>
        ),
        fullscreen: false,
      }
    }

    if (permission === "bash") {
      const title = typeof data.description === "string" && data.description ? data.description : "Shell command"
      const command = typeof data.command === "string" ? data.command : ""
      return {
        icon: "#",
        title,
        body: (
          <Show when={command}>
            <box paddingLeft={1}>
              <text fg={theme.text}>{"$ " + command}</text>
            </box>
          </Show>
        ),
        fullscreen: false,
      }
    }

    if (permission === "task") {
      const type = typeof data.subagent_type === "string" ? data.subagent_type : "Unknown"
      const desc = typeof data.description === "string" ? data.description : ""
      return {
        icon: "#",
        title: `${Locale.titlecase(type)} Task`,
        body: (
          <Show when={desc}>
            <box paddingLeft={1}>
              <text fg={theme.text}>{"◉ " + desc}</text>
            </box>
          </Show>
        ),
        fullscreen: false,
      }
    }

    if (permission === "webfetch") {
      const url = typeof data.url === "string" ? data.url : ""
      return {
        icon: "%",
        title: `WebFetch ${url}`,
        body: (
          <Show when={url}>
            <box paddingLeft={1}>
              <text fg={theme.textMuted}>{"URL: " + url}</text>
            </box>
          </Show>
        ),
        fullscreen: false,
      }
    }

    if (permission === "websearch") {
      const query = typeof data.query === "string" ? data.query : ""
      return {
        icon: "◈",
        title: `Exa Web Search "${query}"`,
        body: (
          <Show when={query}>
            <box paddingLeft={1}>
              <text fg={theme.textMuted}>{"Query: " + query}</text>
            </box>
          </Show>
        ),
        fullscreen: false,
      }
    }

    if (permission === "codesearch") {
      const query = typeof data.query === "string" ? data.query : ""
      return {
        icon: "◇",
        title: `Exa Code Search "${query}"`,
        body: (
          <Show when={query}>
            <box paddingLeft={1}>
              <text fg={theme.textMuted}>{"Query: " + query}</text>
            </box>
          </Show>
        ),
        fullscreen: false,
      }
    }

    if (permission === "external_directory") {
      return external(tool(), data, ext().file, ext().dir)
    }

    if (permission === "doom_loop") {
      return {
        icon: "⟳",
        title: "Continue after repeated failures",
        body: (
          <box paddingLeft={1}>
            <text fg={theme.textMuted}>This keeps the session running despite repeated failures.</text>
          </box>
        ),
        fullscreen: false,
      }
    }

    return {
      icon: "⚙",
      title: `Call tool ${permission}`,
      body: (
        <box paddingLeft={1}>
          <text fg={theme.textMuted}>{"Tool: " + permission}</text>
        </box>
      ),
      fullscreen: false,
    }
  })

  return (
    <Switch>
      <Match when={store.stage === "reject"}>
        <RejectPrompt
          onConfirm={(message) => {
            sdk.client.permission.reply({
              reply: "reject",
              requestID: props.request.id,
              message: message || undefined,
            })
          }}
          onCancel={() => {
            setStore("stage", "permission")
          }}
        />
      </Match>
      <Match when={store.stage === "permission"}>
        <Prompt
          title="Permission required"
          header={
            <box flexDirection="column" gap={0}>
              <box flexDirection="row" gap={1} flexShrink={0}>
                <text fg={theme.warning}>{"△"}</text>
                <text fg={theme.text}>Permission required</text>
              </box>
              <box flexDirection="row" gap={1} paddingLeft={2} flexShrink={0}>
                <text fg={theme.textMuted} flexShrink={0}>
                  {info().icon}
                </text>
                <text fg={theme.text}>{info().title}</text>
              </box>
            </box>
          }
          body={info().body}
          options={{ once: "Allow once", always: "Allow always", reject: "Reject" }}
          escapeKey="reject"
          fullscreen={info().fullscreen}
          onSelect={(option) => {
            if (option === "reject") {
              if (session()?.parentID) {
                setStore("stage", "reject")
                return
              }
              sdk.client.permission.reply({
                reply: "reject",
                requestID: props.request.id,
              })
              return
            }
            sdk.client.permission.reply({
              reply: option,
              requestID: props.request.id,
            })
          }}
        />
      </Match>
    </Switch>
  )
}

function RejectPrompt(props: { onConfirm: (message: string) => void; onCancel: () => void }) {
  let input: TextareaRenderable
  const { theme } = useTheme()
  const keybind = useKeybind()
  const textareaKeybindings = useTextareaKeybindings()
  const dimensions = useTerminalDimensions()
  const narrow = createMemo(() => dimensions().width < 80)
  const dialog = useDialog()

  useKeyboard((evt) => {
    if (dialog.stack.length > 0) return

    if (evt.name === "escape" || keybind.match("app_exit", evt)) {
      evt.preventDefault()
      props.onCancel()
      return
    }
    if (evt.name === "return") {
      evt.preventDefault()
      props.onConfirm(input.plainText)
    }
  })

  return (
    <box
      backgroundColor={theme.backgroundPanel}
      border={["left"]}
      borderColor={theme.error}
      customBorderChars={SplitBorder.customBorderChars}
    >
      <box gap={1} paddingLeft={1} paddingRight={3} paddingTop={1} paddingBottom={1}>
        <box flexDirection="row" gap={1} paddingLeft={1}>
          <text fg={theme.error}>{"△"}</text>
          <text fg={theme.text}>Reject permission</text>
        </box>
        <box paddingLeft={1}>
          <text fg={theme.textMuted}>Tell OpenCode what to do differently</text>
        </box>
      </box>
      <box
        flexDirection={narrow() ? "column" : "row"}
        flexShrink={0}
        paddingTop={1}
        paddingLeft={2}
        paddingRight={3}
        paddingBottom={1}
        backgroundColor={theme.backgroundElement}
        justifyContent={narrow() ? "flex-start" : "space-between"}
        alignItems={narrow() ? "flex-start" : "center"}
        gap={1}
      >
        <textarea
          ref={(val: TextareaRenderable) => {
            input = val
            val.traits = { status: "REJECT" }
          }}
          focused
          textColor={theme.text}
          focusedTextColor={theme.text}
          cursorColor={theme.primary}
          keyBindings={textareaKeybindings()}
        />
        <box flexDirection="row" gap={2} flexShrink={0}>
          <text fg={theme.text}>
            enter <span style={{ fg: theme.textMuted }}>confirm</span>
          </text>
          <text fg={theme.text}>
            esc <span style={{ fg: theme.textMuted }}>cancel</span>
          </text>
        </box>
      </box>
    </box>
  )
}

function Prompt<const T extends Record<string, string>>(props: {
  title: string
  header?: JSX.Element
  body: JSX.Element
  options: T
  escapeKey?: keyof T
  fullscreen?: boolean
  onSelect: (option: keyof T) => void
}) {
  const { theme } = useTheme()
  const keybind = useKeybind()
  const dimensions = useTerminalDimensions()
  const keys = Object.keys(props.options) as (keyof T)[]
  const [store, setStore] = createStore({
    selected: keys[0],
    expanded: false,
  })
  const diffKey = Keybind.parse("ctrl+f")[0]
  const narrow = createMemo(() => dimensions().width < 80)
  const dialog = useDialog()

  useKeyboard((evt) => {
    if (dialog.stack.length > 0) return

    const max = Math.min(keys.length, 9)
    const digit = Number(evt.name)

    if (!Number.isNaN(digit) && digit >= 1 && digit <= max) {
      evt.preventDefault()
      const next = keys[digit - 1]
      setStore("selected", next)
      props.onSelect(next)
      return
    }

    if (evt.name === "left" || evt.name === "up" || evt.name == "h" || evt.name == "k") {
      evt.preventDefault()
      const idx = keys.indexOf(store.selected)
      const next = keys[(idx - 1 + keys.length) % keys.length]
      setStore("selected", next)
      return
    }

    if (evt.name === "right" || evt.name === "down" || evt.name == "l" || evt.name == "j") {
      evt.preventDefault()
      const idx = keys.indexOf(store.selected)
      const next = keys[(idx + 1) % keys.length]
      setStore("selected", next)
      return
    }

    if (evt.name === "return") {
      evt.preventDefault()
      props.onSelect(store.selected)
    }

    if (props.escapeKey && (evt.name === "escape" || keybind.match("app_exit", evt))) {
      evt.preventDefault()
      props.onSelect(props.escapeKey)
    }

    if (props.fullscreen && diffKey && Keybind.match(diffKey, keybind.parse(evt))) {
      evt.preventDefault()
      evt.stopPropagation()
      setStore("expanded", (v) => !v)
    }
  })

  const hint = createMemo(() => (store.expanded ? "minimize" : "fullscreen"))
  const renderer = useRenderer()

  const content = () => (
    <box
      backgroundColor={theme.backgroundPanel}
      border={["left"]}
      borderColor={theme.warning}
      customBorderChars={SplitBorder.customBorderChars}
      {...(store.expanded
        ? { top: dimensions().height * -1 + 1, bottom: 1, left: 2, right: 2, position: "absolute" }
        : {
            top: 0,
            maxHeight: 15,
            bottom: 0,
            left: 0,
            right: 0,
            position: "relative",
          })}
    >
      <box gap={1} paddingLeft={1} paddingRight={3} paddingTop={1} paddingBottom={1} flexGrow={1}>
        <Show
          when={props.header}
          fallback={
            <box flexDirection="row" gap={1} paddingLeft={1} flexShrink={0}>
              <text fg={theme.warning}>{"△"}</text>
              <text fg={theme.text}>{props.title}</text>
            </box>
          }
        >
          <box paddingLeft={1} flexShrink={0}>
            {props.header}
          </box>
        </Show>
        {props.body}
      </box>
      <box
        flexDirection={narrow() ? "column" : "row"}
        flexShrink={0}
        gap={2}
        paddingTop={1}
        paddingLeft={2}
        paddingRight={3}
        paddingBottom={1}
        backgroundColor={theme.backgroundElement}
        justifyContent="space-between"
        alignItems={narrow() ? "flex-start" : "center"}
      >
        <box flexDirection="row" gap={1} flexShrink={0}>
          <For each={keys}>
            {(option, index) => (
              <box
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={option === store.selected ? theme.warning : undefined}
                onMouseOver={() => setStore("selected", option)}
                onMouseUp={() => {
                  setStore("selected", option)
                  props.onSelect(option)
                }}
              >
                <text fg={option === store.selected ? theme.backgroundPanel : theme.textMuted}>
                  {`${index() + 1}. ${props.options[option]}`}
                </text>
              </box>
            )}
          </For>
        </box>
        <box flexDirection="row" gap={2} flexShrink={0}>
          <Show when={props.fullscreen}>
            <text fg={theme.text}>
              {"ctrl+f"} <span style={{ fg: theme.textMuted }}>{hint()}</span>
            </text>
          </Show>
          <text fg={theme.text}>
            {"⇆"} <span style={{ fg: theme.textMuted }}>select</span>
          </text>
          <text fg={theme.text}>
            enter <span style={{ fg: theme.textMuted }}>confirm</span>
          </text>
          <Show when={props.escapeKey}>
            <text fg={theme.text}>
              esc <span style={{ fg: theme.textMuted }}>reject</span>
            </text>
          </Show>
        </box>
      </box>
    </box>
  )

  return (
    <Show when={!store.expanded} fallback={<Portal>{content()}</Portal>}>
      {content()}
    </Show>
  )
}
