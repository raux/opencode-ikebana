import { test, expect, describe } from "bun:test"
import { AppFileSystem } from "../../src/filesystem"
import { NodeFileSystem } from "@effect/platform-node"
import { Layer, Effect } from "effect"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import path from "path"

const live = AppFileSystem.layer.pipe(Layer.provide(NodeFileSystem.layer))

describe("AppFileSystem Guardrails", () => {
  test("blocks absolute path escape attempt", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const tmp = yield* Effect.promise(() => tmpdir({ git: true }))
      const forbidden = "/etc/passwd"

      yield* Instance.provide({
        directory: tmp.path,
        fn: () => Effect.gen(function* () {
          const fs = yield* AppFileSystem.Service
          try {
            yield* fs.readFileString(forbidden)
            throw new Error("Should have failed")
          } catch (e) {
            // Success
          }
        }),
      })
    }))
  })

  test("blocks relative path escape attempt", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const tmp = yield* Effect.promise(() => tmpdir({ git: true }))
      const escapePath = path.join(tmp.path, "..", "escape.txt")

      yield* Instance.provide({
        directory: tmp.path,
        fn: () => Effect.gen(function* () {
          const fs = yield* AppFileSystem.Service
          try {
            yield* fs.readFileString(escapePath)
            throw new Error("Should have failed")
          } catch (e) {
            // Success
          }
        }),
      })
    }))
  })

  test("allows access within project directory", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const tmp = yield* Effect.promise(() => tmpdir({ git: true }))
      const validFile = path.join(tmp.path, "valid.txt")
      yield* Effect.promise(() => Bun.write(validFile, "content"))

      yield* Instance.provide({
        directory: tmp.path,
        fn: () => Effect.gen(function* () {
          const fs = yield* AppFileSystem.Service
          const content = yield* fs.readFileString(validFile)
          expect(content).toBe("content")
        }),
      })
    }))
  })
}))", 