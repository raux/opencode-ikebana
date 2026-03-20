import { Component, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import type { ImageAttachmentPart } from "@/context/prompt"

type PromptImageAttachmentsProps = {
  attachments: ImageAttachmentPart[]
  onOpen: (attachment: ImageAttachmentPart) => void
  onRemove: (id: string) => void
  removeLabel: string
}

type PromptImageAttachmentProps = {
  attachment: ImageAttachmentPart
  onOpen: (attachment: ImageAttachmentPart) => void
  onRemove: (id: string) => void
  removeLabel: string
}

const fallbackClass =
  "size-12 rounded-[6px] bg-background-stronger flex items-center justify-center shadow-xs-border cursor-default"
const imageClass = "size-12 rounded-[6px] object-cover shadow-xs-border"
const removeClass =
  "absolute -top-1.5 -right-1.5 size-5 rounded-full bg-surface-raised-stronger-non-alpha border border-border-base flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-raised-base-hover"

export const PromptImageAttachments: Component<PromptImageAttachmentsProps> = (props) => {
  return (
    <Show when={props.attachments.length > 0}>
      <>
        {props.attachments.map((attachment) => (
          <PromptImageAttachment
            attachment={attachment}
            onOpen={props.onOpen}
            onRemove={props.onRemove}
            removeLabel={props.removeLabel}
          />
        ))}
      </>
    </Show>
  )
}

export const PromptImageAttachment: Component<PromptImageAttachmentProps> = (props) => {
  return (
    <Tooltip value={props.attachment.filename} placement="top" gutter={6} class="shrink-0">
      <div class="relative group">
        <Show
          when={props.attachment.mime.startsWith("image/")}
          fallback={
            <div class={fallbackClass}>
              <Icon name="folder" class="size-6 text-text-weak" />
            </div>
          }
        >
          <img
            src={props.attachment.dataUrl}
            alt={props.attachment.filename}
            class={imageClass}
            onClick={() => props.onOpen(props.attachment)}
          />
        </Show>
        <button
          type="button"
          onClick={() => props.onRemove(props.attachment.id)}
          class={removeClass}
          aria-label={props.removeLabel}
        >
          <Icon name="close" class="size-3 text-text-weak" />
        </button>
      </div>
    </Tooltip>
  )
}
