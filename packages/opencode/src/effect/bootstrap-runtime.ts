import { Layer, ManagedRuntime } from "effect"
import { memoMap } from "./run-service"

import { Format } from "@/format"
import { ShareNext } from "@/share/share-next"
import { Snapshot } from "@/snapshot"

export const BootstrapLayer = Layer.mergeAll(Format.defaultLayer, ShareNext.defaultLayer, Snapshot.defaultLayer)

export const BootstrapRuntime = ManagedRuntime.make(BootstrapLayer, { memoMap })
