import z from "zod"
import { AppFileSystem } from "@/filesystem"
import { makeRuntime } from "@/effect/run-service"
import { Database, eq } from "@/storage/db"
import type { Project } from "@/project/project"
import { BusEvent } from "@/bus/bus-event"
import { GlobalBus } from "@/bus/global"
import { SyncEvent } from "@/sync"
import { Log } from "@/util/log"
import { ProjectID } from "@/project/schema"
import { WorkspaceTable } from "./workspace.sql"
import { getAdaptor } from "./adaptors"
import { WorkspaceInfo } from "./types"
import { WorkspaceID } from "./schema"
import { parseSSE } from "./sse"
import { Context, Effect, Layer, Scope } from "effect"

export namespace Workspace {
  export const Info = WorkspaceInfo.meta({
    ref: "Workspace",
  })
  export type Info = z.infer<typeof Info>

  export const ConnectionStatus = z.object({
    workspaceID: WorkspaceID.zod,
    status: z.enum(["connected", "connecting", "disconnected", "error"]),
    error: z.string().optional(),
  })
  export type ConnectionStatus = z.infer<typeof ConnectionStatus>

  export const Event = {
    Ready: BusEvent.define(
      "workspace.ready",
      z.object({
        name: z.string(),
      }),
    ),
    Failed: BusEvent.define(
      "workspace.failed",
      z.object({
        message: z.string(),
      }),
    ),
    Status: BusEvent.define("workspace.status", ConnectionStatus),
  }

  function fromRow(row: typeof WorkspaceTable.$inferSelect): Info {
    return {
      id: row.id,
      type: row.type,
      branch: row.branch,
      name: row.name,
      directory: row.directory,
      extra: row.extra,
      projectID: row.project_id,
    }
  }

  export const CreateInput = z.object({
    id: WorkspaceID.zod.optional(),
    type: Info.shape.type,
    branch: Info.shape.branch,
    projectID: ProjectID.zod,
    extra: Info.shape.extra,
  })
  export type CreateInput = z.infer<typeof CreateInput>

  const log = Log.create({ service: "workspace-sync" })

  export interface Interface {
    readonly create: (input: CreateInput) => Effect.Effect<Info>
    readonly list: (projectID: ProjectID) => Effect.Effect<Info[]>
    readonly get: (id: WorkspaceID) => Effect.Effect<Info | undefined>
    readonly remove: (id: WorkspaceID) => Effect.Effect<Info | undefined>
    readonly status: () => Effect.Effect<ConnectionStatus[]>
  }

  export class Service extends Context.Service<Service, Interface>()("@opencode/Workspace") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const fs = yield* AppFileSystem.Service
      const scope = yield* Scope.Scope
      const connections = new Map<WorkspaceID, ConnectionStatus>()
      const aborts = new Map<WorkspaceID, AbortController>()

      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          for (const abort of aborts.values()) abort.abort()
        }),
      )

      const db = <T>(fn: (db: Parameters<typeof Database.use>[0] extends (trx: infer D) => any ? D : never) => T) =>
        Effect.sync(() => Database.use(fn))

      const setStatus = Effect.fnUntraced(function* (
        id: WorkspaceID,
        status: ConnectionStatus["status"],
        error?: string,
      ) {
        const prev = connections.get(id)
        if (prev?.status === status && prev?.error === error) return
        const next = { workspaceID: id, status, error }
        connections.set(id, next)
        GlobalBus.emit("event", {
          directory: "global",
          workspace: id,
          payload: {
            type: Event.Status.type,
            properties: next,
          },
        })
      })

      const stopSync = Effect.fnUntraced(function* (id: WorkspaceID) {
        aborts.get(id)?.abort()
        aborts.delete(id)
        connections.delete(id)
      })

      const workspaceEventLoop = Effect.fn("Workspace.workspaceEventLoop")(function* (
        space: Info,
        signal: AbortSignal,
      ) {
        log.info("starting sync: " + space.id)

        while (!signal.aborted) {
          log.info("connecting to sync: " + space.id)

          yield* setStatus(space.id, "connecting")
          const adaptor = yield* Effect.promise(() => getAdaptor(space.type)).pipe(Effect.orDie)
          const target = yield* Effect.promise(() => Promise.resolve(adaptor.target(space))).pipe(Effect.orDie)

          if (target.type === "local") return

          const res = yield* Effect.tryPromise({
            try: () => fetch(target.url + "/sync/event", { method: "GET", signal }),
            catch: (err) => String(err),
          }).pipe(
            Effect.catch((err) => setStatus(space.id, "error", err).pipe(Effect.as(undefined as Response | undefined))),
          )

          if (!res || !res.ok || !res.body) {
            log.info("failed to connect to sync: " + res?.status)
            yield* setStatus(space.id, "error", res ? `HTTP ${res.status}` : "no response")
            yield* Effect.sleep("1 second")
            continue
          }

          const body = res.body
          yield* setStatus(space.id, "connected")
          yield* Effect.promise(() =>
            parseSSE(body, signal, (evt) => {
              const event = evt as SyncEvent.SerializedEvent

              try {
                if (!event.type.startsWith("server.")) {
                  SyncEvent.replay(event)
                }
              } catch (err) {
                log.warn("failed to replay sync event", {
                  workspaceID: space.id,
                  error: err,
                })
              }
            }),
          ).pipe(Effect.orDie)

          yield* setStatus(space.id, "disconnected")
          log.info("disconnected to sync: " + space.id)
          yield* Effect.sleep("250 millis")
        }
      })

      const startSync = Effect.fn("Workspace.startSync")(function* (space: Info) {
        if (space.type === "worktree") {
          yield* Effect.gen(function* () {
            const exists = yield* fs.exists(space.directory!).pipe(Effect.orDie)
            yield* setStatus(space.id, exists ? "connected" : "error", exists ? undefined : "directory does not exist")
          }).pipe(Effect.forkIn(scope))
          return
        }

        if (aborts.has(space.id)) return

        const abort = new AbortController()
        aborts.set(space.id, abort)
        yield* setStatus(space.id, "disconnected")
        yield* workspaceEventLoop(space, abort.signal).pipe(
          Effect.catchCause((cause) =>
            Effect.gen(function* () {
              yield* setStatus(space.id, "error", String(cause))
              yield* Effect.sync(() => {
                log.warn("workspace sync listener failed", {
                  workspaceID: space.id,
                  error: cause,
                })
              })
            }),
          ),
          Effect.forkIn(scope),
        )
      })

      const create = Effect.fn("Workspace.create")(function* (input: CreateInput) {
        const id = WorkspaceID.ascending(input.id)
        const adaptor = yield* Effect.promise(() => getAdaptor(input.type)).pipe(Effect.orDie)
        const config = yield* Effect.promise(() =>
          Promise.resolve(adaptor.configure({ ...input, id, name: null, directory: null })),
        ).pipe(Effect.orDie)

        const info: Info = {
          id,
          type: config.type,
          branch: config.branch ?? null,
          name: config.name ?? null,
          directory: config.directory ?? null,
          extra: config.extra ?? null,
          projectID: input.projectID,
        }

        yield* db((db) => {
          db.insert(WorkspaceTable)
            .values({
              id: info.id,
              type: info.type,
              branch: info.branch,
              name: info.name,
              directory: info.directory,
              extra: info.extra,
              project_id: info.projectID,
            })
            .run()
        })

        yield* Effect.promise(() => adaptor.create(config)).pipe(Effect.orDie)
        yield* startSync(info)
        return info
      })

      const list = Effect.fn("Workspace.list")(function* (projectID: ProjectID) {
        const rows = yield* db((db) =>
          db.select().from(WorkspaceTable).where(eq(WorkspaceTable.project_id, projectID)).all(),
        )
        const spaces = rows.map(fromRow).sort((a, b) => a.id.localeCompare(b.id))
        for (const space of spaces) {
          yield* startSync(space)
        }
        return spaces
      })

      const get = Effect.fn("Workspace.get")(function* (id: WorkspaceID) {
        const row = yield* db((db) => db.select().from(WorkspaceTable).where(eq(WorkspaceTable.id, id)).get())
        if (!row) return
        const space = fromRow(row)
        yield* startSync(space)
        return space
      })

      const remove = Effect.fn("Workspace.remove")(function* (id: WorkspaceID) {
        const row = yield* db((db) => db.select().from(WorkspaceTable).where(eq(WorkspaceTable.id, id)).get())
        if (!row) return

        yield* stopSync(id)

        const info = fromRow(row)
        const adaptor = yield* Effect.promise(() => getAdaptor(row.type)).pipe(Effect.orDie)
        yield* Effect.sync(() => {
          void adaptor.remove(info)
        })
        yield* db((db) => db.delete(WorkspaceTable).where(eq(WorkspaceTable.id, id)).run())
        return info
      })

      const status = Effect.fn("Workspace.status")(() => Effect.succeed([...connections.values()]))

      return Service.of({ create, list, get, remove, status })
    }),
  )

  export const defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer))

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export async function create(input: CreateInput) {
    return runPromise((svc) => svc.create(input))
  }

  export async function list(project: Project.Info) {
    return runPromise((svc) => svc.list(project.id))
  }

  export async function get(id: WorkspaceID) {
    return runPromise((svc) => svc.get(id))
  }

  export async function remove(id: WorkspaceID) {
    return runPromise((svc) => svc.remove(id))
  }

  export async function status() {
    return runPromise((svc) => svc.status())
  }
}
