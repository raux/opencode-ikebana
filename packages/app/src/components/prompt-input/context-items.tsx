import { Component, For, Show, createMemo } from "solid-js"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { getDirectory, getFilename, getFilenameTruncated } from "@opencode-ai/util/path"
import type { ContextItem, ImageAttachmentPart } from "@/context/prompt"
import { PromptImageAttachment } from "./image-attachments"
import { CommentChip } from "@/components/comment-chip"

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
                <CommentChip
                  variant="preview"
                  path={row.item.path}
                  label={label}
                  selection={
                    row.item.selection
                      ? {
                          start: row.item.selection.startLine,
                          end: row.item.selection.endLine,
                        }
                      : undefined
                  }
                  comment={row.item.comment}
                  class="max-w-[200px]"
                  onOpen={() => props.openComment(row.item)}
                  onRemove={() => props.remove(row.item)}
                  removeLabel={props.t("prompt.context.removeFile")}
                />
              </Tooltip>
            )
          }}
        </For>
      </div>
    </Show>
  )
}
