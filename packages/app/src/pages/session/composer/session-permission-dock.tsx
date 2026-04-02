import { For, Show, createMemo, createSignal, onMount } from "solid-js"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import { Button } from "@opencode-ai/ui/button"
import { DockPrompt } from "@opencode-ai/ui/dock-prompt"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useLanguage } from "@/context/language"
import { useSync } from "@/context/sync"

type Decision = "once" | "always" | "reject"

const ORDER: Decision[] = ["once", "always", "reject"]

function text(input: unknown) {
  return typeof input === "string" ? input : ""
}

function preview(input: string, limit: number = 6) {
  const text = input.trim()
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

function parent(request: PermissionRequest) {
  const raw = request.metadata?.parentDir
  if (typeof raw === "string" && raw) return raw
  const pattern = request.patterns[0]
  if (!pattern) return ""
  if (!pattern.endsWith("*")) return pattern
  return pattern.slice(0, -1).replace(/[\\/]$/, "")
}

function remember(dir: string) {
  return dir ? `Allow always remembers access to ${dir} for this session.` : ""
}

function external(tool: string, input: Record<string, unknown>, file: string, dir: string) {
  const note = remember(dir)
  if (tool === "write") {
    return {
      title: "Write file outside workspace",
      hint: "This approval covers the external directory check and this write.",
      file,
      dir,
      preview: preview(text(input.content)),
      remember: note,
    }
  }

  if (tool === "edit") {
    return {
      title: "Edit file outside workspace",
      hint: "This approval covers the external directory check and this edit.",
      file,
      dir,
      preview: preview(text(input.newString)),
      remember: note,
    }
  }

  if (tool === "apply_patch") {
    return {
      title: "Apply patch outside workspace",
      hint: "This approval covers the external directory check and this patch.",
      file,
      dir,
      preview: preview(text(input.patchText)),
      remember: note,
    }
  }

  if (tool === "read") {
    return {
      title: "Read file outside workspace",
      hint: "This approval covers the external directory check and this read.",
      file,
      dir,
      preview: "",
      remember: note,
    }
  }

  return {
    title: dir ? "Access external directory" : "",
    hint: "This action needs access outside the current workspace.",
    file,
    dir,
    preview: "",
    remember: note,
  }
}

export function SessionPermissionDock(props: {
  request: PermissionRequest
  responding: boolean
  onDecide: (response: Decision) => void
}) {
  const language = useLanguage()
  const sync = useSync()
  const [selected, setSelected] = createSignal<Decision>("once")
  let root: HTMLDivElement | undefined

  const part = createMemo(() => {
    const tool = props.request.tool
    if (!tool) return
    return (sync.data.part[tool.messageID] ?? []).find((item) => item.type === "tool" && item.callID === tool.callID)
  })

  const input = createMemo(() => {
    const next = part()
    if (!next || next.type !== "tool") return {}
    return next.state.input ?? {}
  })

  const info = createMemo(() => {
    const dir = parent(props.request)
    const data = input()
    const file = text(data.filePath) || text(props.request.metadata?.filepath)
    const current = part()
    const tool = current && current.type === "tool" ? current.tool : ""

    if (props.request.permission === "external_directory") {
      const next = external(tool, data, file, dir)
      return {
        ...next,
        title: next.title || language.t("notification.permission.title"),
      }
    }

    const key = `settings.permissions.tool.${props.request.permission}.description`
    const value = language.t(key as Parameters<typeof language.t>[0])
    return {
      title: language.t("notification.permission.title"),
      hint: value === key ? "" : value,
      file,
      dir,
      preview: "",
      remember: "",
    }
  })

  const options = createMemo(() => [
    {
      value: "once" as const,
      label: language.t("ui.permission.allowOnce"),
      detail: info().hint,
    },
    {
      value: "always" as const,
      label: language.t("ui.permission.allowAlways"),
      detail: info().remember,
    },
    {
      value: "reject" as const,
      label: language.t("ui.permission.deny"),
      detail: "",
    },
  ])

  const choose = (value: Decision) => {
    setSelected(value)
    if (props.responding) return
    props.onDecide(value)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (props.responding) return
    if (event.defaultPrevented) return
    if (event.metaKey || event.ctrlKey || event.altKey) return

    if (event.key === "1") {
      event.preventDefault()
      choose("once")
      return
    }

    if (event.key === "2") {
      event.preventDefault()
      choose("always")
      return
    }

    if (event.key === "3") {
      event.preventDefault()
      choose("reject")
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      choose("reject")
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      const idx = ORDER.indexOf(selected())
      setSelected(ORDER[(idx - 1 + ORDER.length) % ORDER.length])
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      const idx = ORDER.indexOf(selected())
      setSelected(ORDER[(idx + 1) % ORDER.length])
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      choose(selected())
    }
  }

  onMount(() => {
    requestAnimationFrame(() => root?.focus())
  })

  return (
    <DockPrompt
      kind="permission"
      ref={(el) => {
        root = el
        root.tabIndex = -1
      }}
      onKeyDown={onKeyDown}
      header={
        <div data-slot="permission-row" data-variant="header">
          <span data-slot="permission-icon">
            <Icon name="warning" size="normal" />
          </span>
          <div data-slot="permission-header-title">{info().title}</div>
        </div>
      }
      footer={
        <>
          <div class="text-11-regular text-text-weak">1/2/3 choose</div>
          <div class="text-11-regular text-text-weak text-right">enter confirm • esc deny</div>
        </>
      }
    >
      <Show when={info().file}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div class="flex flex-col gap-1 min-w-0">
            <div class="text-12-medium text-text-weak uppercase tracking-[0.08em]">File</div>
            <code class="text-12-regular text-text-base break-all">{info().file}</code>
          </div>
        </div>
      </Show>

      <Show when={info().dir}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div class="flex flex-col gap-1 min-w-0">
            <div class="text-12-medium text-text-weak uppercase tracking-[0.08em]">Directory</div>
            <code class="text-12-regular text-text-base break-all">{info().dir}</code>
          </div>
        </div>
      </Show>

      <Show when={info().preview}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div class="flex flex-col gap-1 min-w-0">
            <div class="text-12-medium text-text-weak uppercase tracking-[0.08em]">Preview</div>
            <pre class="m-0 rounded-md bg-background-base/70 px-3 py-2 overflow-x-auto text-12-regular text-text-base whitespace-pre-wrap break-words">
              {info().preview}
            </pre>
          </div>
        </div>
      </Show>

      <Show when={!info().file && !info().dir && props.request.patterns.length > 0}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-patterns">
            <For each={props.request.patterns}>
              {(pattern) => <code class="text-12-regular text-text-base break-all">{pattern}</code>}
            </For>
          </div>
        </div>
      </Show>

      <div data-slot="permission-row">
        <span data-slot="permission-spacer" aria-hidden="true" />
        <div class="flex w-full flex-col gap-2">
          <For each={options()}>
            {(option, index) => (
              <Button
                variant={
                  selected() === option.value
                    ? option.value === "once"
                      ? "primary"
                      : option.value === "always"
                        ? "secondary"
                        : "ghost"
                    : "ghost"
                }
                size="normal"
                onMouseEnter={() => setSelected(option.value)}
                onClick={() => choose(option.value)}
                disabled={props.responding}
                class="w-full justify-start px-3 py-2 h-auto"
              >
                <span class="flex flex-col items-start gap-0.5 text-left min-w-0">
                  <span class="inline-flex items-center gap-2">
                    <Show when={props.responding && selected() === option.value}>
                      <Spinner class="size-3.5" />
                    </Show>
                    {`${index() + 1}. ${option.label}`}
                  </span>
                  <Show when={option.detail}>
                    <span class="text-11-regular text-text-weak whitespace-normal">{option.detail}</span>
                  </Show>
                </span>
              </Button>
            )}
          </For>
        </div>
      </div>
    </DockPrompt>
  )
}
