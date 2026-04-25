import { afterEach, test, expect } from "bun:test"
import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import { Snapshot } from "../../src/snapshot"
import { Instance } from "../../src/project/instance"
import { Filesystem } from "../../src/util/filesystem"
import { tmpdir } from "../fixture/fixture"

afterEach(async () => {
  await Instance.disposeAll()
})

async function bootstrap() {
  return tmpdir({
    git: true,
    init: async (dir) => {
      const unique = Math.random().toString(36).slice(2)
      const content = `Original content ${unique}`
      await Filesystem.write(`${dir}/test.txt`, content)
      await $`git add .`.cwd(dir).quiet()
      await $`git commit -m init`.cwd(dir).quiet()
      return {
        content,
      }
    },
  })
}

test("git_undo: snapshot creates a checkpoint", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const hash = await Snapshot.track()
      expect(hash).toBeTruthy()
      expect(typeof hash).toBe("string")
      expect(hash!.length).toBeGreaterThan(0)
    },
  })
})

test("git_undo: undo reverts file changes", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      // Create snapshot of original state
      const before = await Snapshot.track()
      expect(before).toBeTruthy()

      // Verify original content
      const originalContent = await fs.readFile(`${tmp.path}/test.txt`, "utf-8")
      expect(originalContent).toBe(tmp.extra.content)

      // Modify the file
      const modifiedContent = "Modified content that should be undone"
      await Filesystem.write(`${tmp.path}/test.txt`, modifiedContent)

      // Verify modification
      const afterModify = await fs.readFile(`${tmp.path}/test.txt`, "utf-8")
      expect(afterModify).toBe(modifiedContent)

      // Undo the change
      await Snapshot.revert([await Snapshot.patch(before!)])

      // Verify revert - content should be back to original
      const afterRevert = await fs.readFile(`${tmp.path}/test.txt`, "utf-8")
      expect(afterRevert).toBe(tmp.extra.content)
    },
  })
})

test("git_undo: undo removes newly added files", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      // Create snapshot
      const before = await Snapshot.track()
      expect(before).toBeTruthy()

      // Add a new file
      await Filesystem.write(`${tmp.path}/new_file.txt`, "New file content")

      // Verify file exists
      expect(
        await fs
          .access(`${tmp.path}/new_file.txt`)
          .then(() => true)
          .catch(() => false),
      ).toBe(true)

      // Undo
      await Snapshot.revert([await Snapshot.patch(before!)])

      // Verify file is gone
      expect(
        await fs
          .access(`${tmp.path}/new_file.txt`)
          .then(() => true)
          .catch(() => false),
      ).toBe(false)
    },
  })
})

test("git_undo: undo restores deleted files", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      // Create snapshot
      const before = await Snapshot.track()
      expect(before).toBeTruthy()

      // Delete the file
      await fs.rm(`${tmp.path}/test.txt`)

      // Verify file is gone
      expect(
        await fs
          .access(`${tmp.path}/test.txt`)
          .then(() => true)
          .catch(() => false),
      ).toBe(false)

      // Undo
      await Snapshot.revert([await Snapshot.patch(before!)])

      // Verify file is restored
      const restored = await fs.readFile(`${tmp.path}/test.txt`, "utf-8")
      expect(restored).toBe(tmp.extra.content)
    },
  })
})
