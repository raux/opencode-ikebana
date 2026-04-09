import { RGBA } from "@opentui/core"
import { useRoute } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { useDialog } from "@tui/ui/dialog"
import { DialogSelect } from "@tui/ui/dialog-select"
import { createMemo, createResource, createSignal, onMount } from "solid-js"
import { Locale } from "@/util/locale"
import { useKeybind } from "../context/keybind"
import { useSDK } from "../context/sdk"
import { useTheme } from "../context/theme"
import { createDebouncedSignal } from "../util/signal"
import { useToast } from "../ui/toast"
import { DialogSessionRename } from "./dialog-session-rename"
import { DialogWorkspaceCreate, openWorkspaceSession } from "./dialog-workspace-create"
import { Spinner } from "./spinner"

const color = [
  RGBA.fromHex("#ff7a90"),
  RGBA.fromHex("#f8c555"),
  RGBA.fromHex("#70d6a3"),
  RGBA.fromHex("#57c7ff"),
  RGBA.fromHex("#bb9af7"),
  RGBA.fromHex("#ff9e64"),
]

const shape = ["■", "◆", "▲", "▶", "▼", "◀", "●", "◉", "◈", "◊"]
const action = "__workspace_new__"

function hash(text: string) {
  let sum = 0
  for (const char of text) {
    sum = (sum * 31 + char.charCodeAt(0)) >>> 0
  }
  return sum
}

function mark(id?: string) {
  if (!id) {
    return
  }
  const sum = hash(id)
  return {
    fg: color[sum % color.length]!,
    text: shape[sum % shape.length]!,
  }
}

export function DialogSessionList() {
  const dialog = useDialog()
  const route = useRoute()
  const sync = useSync()
  const keybind = useKeybind()
  const { theme } = useTheme()
  const sdk = useSDK()
  const toast = useToast()
  const [toDelete, setToDelete] = createSignal<string>()
  const [search, setSearch] = createDebouncedSignal("", 150)

  const load = async (search?: string) => {
    const result = await sdk.client.session.list({
      roots: true,
      ...(search ? { search, limit: 30 } : {}),
    })
    return result.data ?? []
  }

  const [listed, listedActions] = createResource(async () => load())
  const [found] = createResource(search, async (query) => {
    if (!query) return undefined
    return load(query)
  })

  const current = createMemo(() => (route.data.type === "session" ? route.data.sessionID : undefined))
  const sessions = createMemo(() => found() ?? listed() ?? sync.data.session)

  const options = createMemo(() => {
    const today = new Date().toDateString()
    return [
      {
        title: "+ New workspace session",
        value: action,
        category: "Actions",
        description: "Create a new workspace, then open a session there",
      },
      ...sessions()
        .filter((item) => item.parentID === undefined)
        .toSorted((a, b) => b.time.updated - a.time.updated)
        .map((item) => {
          const badge = mark(item.workspaceID)
          const date = new Date(item.time.updated)
          let category = date.toDateString()
          if (category === today) {
            category = "Today"
          }
          const deleting = toDelete() === item.id
          const status = sync.data.session_status?.[item.id]
          const working = status?.type === "busy"
          return {
            title: deleting ? `Press ${keybind.print("session_delete")} again to confirm` : item.title,
            bg: deleting ? theme.error : undefined,
            value: item.id,
            category,
            footer: Locale.time(item.time.updated),
            gutter: working ? <Spinner /> : undefined,
            margin: badge ? <text fg={badge.fg}>{badge.text}</text> : undefined,
          }
        }),
    ]
  })

  onMount(() => {
    dialog.setSize("large")
  })

  return (
    <DialogSelect
      title="Sessions"
      options={options()}
      skipFilter={true}
      current={current()}
      onFilter={setSearch}
      onMove={() => {
        setToDelete(undefined)
      }}
      onSelect={(option) => {
        if (option.value === action) {
          dialog.replace(() => (
            <DialogWorkspaceCreate
              onSelect={(workspaceID) =>
                openWorkspaceSession({
                  dialog,
                  route,
                  sdk,
                  sync,
                  toast,
                  workspaceID,
                })
              }
            />
          ))
          return
        }
        route.navigate({
          type: "session",
          sessionID: option.value,
        })
        dialog.clear()
      }}
      keybind={[
        {
          keybind: keybind.all.session_delete?.[0],
          title: "delete",
          onTrigger: async (option) => {
            if (option.value === action) return
            if (toDelete() === option.value) {
              const deleted = await sdk.client.session
                .delete({
                  sessionID: option.value,
                })
                .then(() => true)
                .catch(() => false)
              if (!deleted) {
                toast.show({
                  message: "Failed to delete session",
                  variant: "error",
                })
                setToDelete(undefined)
                return
              }
              listedActions.mutate((items) => items?.filter((item) => item.id !== option.value))
              sync.set(
                "session",
                sync.data.session.filter((item) => item.id !== option.value),
              )
              setToDelete(undefined)
              return
            }
            setToDelete(option.value)
          },
        },
        {
          keybind: keybind.all.session_rename?.[0],
          title: "rename",
          onTrigger: async (option) => {
            if (option.value === action) return
            dialog.replace(() => <DialogSessionRename session={option.value} />)
          },
        },
      ]}
    />
  )
}
