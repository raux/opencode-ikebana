import { Effect, Layer, ManagedRuntime } from "effect"
import * as ServiceMap from "effect/ServiceMap"
import { Instance } from "@/project/instance"
import { InstanceRef } from "./instance-state"

export const memoMap = Layer.makeMemoMapUnsafe()

function provide<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> {
  // Try ALS first
  try {
    const ctx = Instance.current
    return Effect.provideService(effect, InstanceRef, ctx)
  } catch {}
  // Try current Effect fiber's InstanceRef (for calls from inside Effect code
  // that escapes to static functions, like sync callbacks calling Bus.publish)
  const fiber = (globalThis as any)["~effect/Fiber/currentFiber"]
  const ref = fiber?.services?.mapUnsafe?.get("~opencode/InstanceRef")
  if (ref) return Effect.provideService(effect, InstanceRef, ref)
  return effect
}

export function makeRuntime<I, S, E>(service: ServiceMap.Service<I, S>, layer: Layer.Layer<I, E>) {
  let rt: ManagedRuntime.ManagedRuntime<I, E> | undefined
  const getRuntime = () => (rt ??= ManagedRuntime.make(layer, { memoMap }))

  return {
    runSync: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>) => getRuntime().runSync(provide(service.use(fn))),
    runPromiseExit: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>, options?: Effect.RunOptions) =>
      getRuntime().runPromiseExit(provide(service.use(fn)), options),
    runPromise: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>, options?: Effect.RunOptions) =>
      getRuntime().runPromise(provide(service.use(fn)), options),
    runFork: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>) => getRuntime().runFork(provide(service.use(fn))),
    runCallback: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>) =>
      getRuntime().runCallback(provide(service.use(fn))),
  }
}
