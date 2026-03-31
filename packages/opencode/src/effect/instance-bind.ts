import { Fiber } from "effect"
import * as ServiceMap from "effect/ServiceMap"
import { Instance } from "@/project/instance"
import { InstanceRef } from "./instance-ref"

export function bind<F extends (...args: any[]) => any>(fn: F): F {
  try {
    return Instance.bind(fn)
  } catch {}
  const fiber = Fiber.getCurrent()
  const ctx = fiber ? ServiceMap.getReferenceUnsafe(fiber.services, InstanceRef) : undefined
  if (!ctx) return fn
  return ((...args: any[]) => Instance.restore(ctx, () => fn(...args))) as F
}
