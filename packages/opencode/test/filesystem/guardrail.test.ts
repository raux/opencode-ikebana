import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AppFileSystem } from "../../src/filesystem"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { testEffect } from "../lib/effect"
import { provideTmpdirInstance } from "../fixture/fixture"
import path from "path"

const it = testEffect(Layer.mergeAll(AppFileSystem.defaultLayer, CrossSpawnSpawner.defaultLayer))

describe("AppFileSystem Guardrails", () => {
  it.live("reads file within project directory", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const file = path.join(dir, "valid.txt")
        yield* Effect.promise(() => Bun.write(file, "content"))
        const content = yield* fs.readFileString(file)
        expect(content).toBe("content")
      }),
    ),
  )

  it.live("resolves relative paths within project directory", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const sub = path.join(dir, "sub")
        yield* fs.makeDirectory(sub)
        const file = path.join(sub, "test.txt")
        yield* Effect.promise(() => Bun.write(file, "nested"))
        const content = yield* fs.readFileString(file)
        expect(content).toBe("nested")
      }),
    ),
  )

  it.live("existsSafe returns false for missing file", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const missing = path.join(dir, "does-not-exist.txt")
        const exists = yield* fs.existsSafe(missing)
        expect(exists).toBe(false)
      }),
    ),
  )
})
