import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { runSyncInstance } from "@/effect/runtime"
import { SessionID } from "./schema"
import { Effect, Layer, ServiceMap } from "effect"
import z from "zod"

export namespace SessionStatus {
  export const Info = z
    .union([
      z.object({
        type: z.literal("idle"),
      }),
      z.object({
        type: z.literal("retry"),
        attempt: z.number(),
        message: z.string(),
        next: z.number(),
      }),
      z.object({
        type: z.literal("busy"),
      }),
    ])
    .meta({
      ref: "SessionStatus",
    })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Status: BusEvent.define(
      "session.status",
      z.object({
        sessionID: SessionID.zod,
        status: Info,
      }),
    ),
    // deprecated
    Idle: BusEvent.define(
      "session.idle",
      z.object({
        sessionID: SessionID.zod,
      }),
    ),
  }

  export interface Interface {
    readonly get: (sessionID: SessionID) => Effect.Effect<Info>
    readonly list: () => Effect.Effect<Record<string, Info>>
    readonly set: (sessionID: SessionID, status: Info) => Effect.Effect<void>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/SessionStatus") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const data = new Map<SessionID, Info>()

      const get = Effect.fn("SessionStatus.get")(function* (sessionID: SessionID) {
        return data.get(sessionID) ?? { type: "idle" as const }
      })

      const list = Effect.fn("SessionStatus.list")(function* () {
        return Object.fromEntries(data)
      })

      const set = Effect.fn("SessionStatus.set")(function* (sessionID: SessionID, status: Info) {
        Bus.publish(Event.Status, { sessionID, status })
        if (status.type === "idle") {
          // deprecated
          Bus.publish(Event.Idle, { sessionID })
          data.delete(sessionID)
          return
        }
        data.set(sessionID, status)
      })

      return Service.of({ get, list, set })
    }),
  )

  export function get(sessionID: SessionID): Info {
    return runSyncInstance(Service.use((svc) => svc.get(sessionID)))
  }

  export function list(): Record<string, Info> {
    return runSyncInstance(Service.use((svc) => svc.list()))
  }

  export function set(sessionID: SessionID, status: Info) {
    runSyncInstance(Service.use((svc) => svc.set(sessionID, status)))
  }
}
