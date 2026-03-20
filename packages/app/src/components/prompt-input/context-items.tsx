import { Component, For, Show, createMemo } from "solid-js"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { getDirectory, getFilename, getFilenameTruncated } from "@opencode-ai/util/path"
import type { ContextItem, ImageAttachmentPart } from "@/context/prompt"
import { PromptImageAttachment } from "./image-attachments"

type PromptContextItem = ContextItem & { key: string }

type ContextItemsProps = {
  items: PromptContextItem[]
  images: ImageAttachmentPart[]
  active: (item: PromptContextItem) => boolean
  openComment: (item: PromptContextItem) => void
  remove: (item: PromptContextItem) => void
  openImage: (attachment: ImageAttachmentPart) => void
  removeImage: (id: string) => void
  imageRemoveLabel: string
  t: (key: string) => string
}

export const PromptContextItems: Component<ContextItemsProps> = (props) => {
  const seen = new Map<string, number>()
  let seq = 0

  const rows = createMemo(() => {
    const all = [
      ...props.items.map((item) => ({ type: "ctx" as const, key: `ctx:${item.key}`, item })),
      ...props.images.map((attachment) => ({ type: "img" as const, key: `img:${attachment.id}`, attachment })),
    ]

    for (const row of all) {
      if (seen.has(row.key)) continue
      seen.set(row.key, seq)
      seq += 1
    }

    return all.slice().sort((a, b) => (seen.get(a.key) ?? 0) - (seen.get(b.key) ?? 0))
  })

  return (
    <Show when={rows().length > 0}>
      <div class="flex flex-nowrap items-start gap-2 p-2 overflow-x-auto no-scrollbar">
        <For each={rows()}>
          {(row) => {
            if (row.type === "img") {
              return (
                <PromptImageAttachment
                  attachment={row.attachment}
                  onOpen={props.openImage}
                  onRemove={props.removeImage}
                  removeLabel={props.imageRemoveLabel}
                />
              )
            }

            const directory = getDirectory(row.item.path)
            const filename = getFilename(row.item.path)
            const label = getFilenameTruncated(row.item.path, 14)
            const selected = props.active(row.item)

            return (
              <Tooltip
                value={
                  <span class="flex max-w-[300px]">
                    <span class="text-text-invert-base truncate-start [unicode-bidi:plaintext] min-w-0">
                      {directory}
                    </span>
                    <span class="shrink-0">{filename}</span>
                  </span>
                }
                placement="top"
                openDelay={2000}
                class="shrink-0"
              >
                <div
                  classList={{
                    "group flex flex-col rounded-[6px] pl-2 pr-1 py-1 max-w-[200px] h-12 cursor-default transition-all transition-transform shadow-xs-border hover:shadow-xs-border-hover": true,
                    "hover:bg-surface-interactive-weak": !!row.item.commentID && !selected,
                    "bg-surface-interactive-hover hover:bg-surface-interactive-hover shadow-xs-border-hover": selected,
                    "bg-background-stronger": !selected,
                  }}
                  onClick={() => props.openComment(row.item)}
                >
                  <div class="flex items-center gap-1.5">
                    <FileIcon node={{ path: row.item.path, type: "file" }} class="shrink-0 size-3.5" />
                    <div class="flex items-center text-11-regular min-w-0 font-medium">
                      <span class="text-text-strong whitespace-nowrap">{label}</span>
                      <Show when={row.item.selection}>
                        {(sel) => (
                          <span class="text-text-weak whitespace-nowrap shrink-0">
                            {sel().startLine === sel().endLine
                              ? `:${sel().startLine}`
                              : `:${sel().startLine}-${sel().endLine}`}
                          </span>
                        )}
                      </Show>
                    </div>
                    <IconButton
                      type="button"
                      icon="close-small"
                      variant="ghost"
                      class="ml-auto size-3.5 text-text-weak hover:text-text-strong transition-all"
                      onClick={(e) => {
                        e.stopPropagation()
                        props.remove(row.item)
                      }}
                      aria-label={props.t("prompt.context.removeFile")}
                    />
                  </div>
                  <Show when={row.item.comment}>
                    {(comment) => <div class="text-12-regular text-text-strong ml-5 pr-1 truncate">{comment()}</div>}
                  </Show>
                </div>
              </Tooltip>
            )
          }}
        </For>
      </div>
    </Show>
  )
}
