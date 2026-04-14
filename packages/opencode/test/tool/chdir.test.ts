import { describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

describe("Instance.chdir", () => {
  test("changes directory and worktree", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await fs.mkdir(path.join(dir, "sub"), { recursive: true })
      },
    })
    const sub = path.join(tmp.path, "sub")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        expect(Instance.directory).toBe(tmp.path)
        expect(Instance.sandboxed).toBe(false)

        Instance.chdir(sub)

        expect(Instance.directory).toBe(sub)
        expect(Instance.worktree).toBe(sub)
        expect(Instance.sandboxed).toBe(true)
      },
    })
  })

  test("containsPath restricts to sandbox", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await fs.mkdir(path.join(dir, "sub"), { recursive: true })
        await fs.writeFile(path.join(dir, "outside.txt"), "x")
        await fs.writeFile(path.join(dir, "sub", "inside.txt"), "y")
      },
    })
    const sub = path.join(tmp.path, "sub")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Before sandbox: both files are within project
        expect(Instance.containsPath(path.join(tmp.path, "outside.txt"))).toBe(true)
        expect(Instance.containsPath(path.join(sub, "inside.txt"))).toBe(true)

        Instance.chdir(sub)

        // After sandbox: only files within sub are contained
        expect(Instance.containsPath(path.join(sub, "inside.txt"))).toBe(true)
        expect(Instance.containsPath(path.join(tmp.path, "outside.txt"))).toBe(false)
      },
    })
  })

  test("resetChdir restores original directory", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await fs.mkdir(path.join(dir, "sub"), { recursive: true })
      },
    })
    const sub = path.join(tmp.path, "sub")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        Instance.chdir(sub)
        expect(Instance.directory).toBe(sub)

        Instance.resetChdir()
        expect(Instance.directory).toBe(tmp.path)
        expect(Instance.sandboxed).toBe(false)
      },
    })
  })

  test("current returns raw ALS context", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await fs.mkdir(path.join(dir, "sub"), { recursive: true })
      },
    })
    const sub = path.join(tmp.path, "sub")

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        Instance.chdir(sub)

        // Instance.directory returns sandbox
        expect(Instance.directory).toBe(sub)
        // Instance.current returns raw ALS context (original directory)
        expect(Instance.current.directory).toBe(tmp.path)
      },
    })
  })

  test("dispose cleans up sandbox", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await fs.mkdir(path.join(dir, "sub"), { recursive: true })
      },
    })
    const sub = path.join(tmp.path, "sub")

    // Set sandbox then dispose
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        Instance.chdir(sub)
        expect(Instance.sandboxed).toBe(true)
        await Instance.dispose()
      },
    })

    // After dispose and re-provide, sandbox should be gone
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        expect(Instance.sandboxed).toBe(false)
        expect(Instance.directory).toBe(tmp.path)
      },
    })
  })
})
