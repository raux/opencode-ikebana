import { Instance } from "./src/project/instance"
import * as path from "path"
import { expect, test } from "bun:test"

test("chdir updates Instance.directory and Instance.worktree", async () => {
  const initialDir = path.resolve("./")
  console.log("Initial directory:", initialDir)

  // We need to bootstrap an instance first
  await Instance.provide({
    directory: initialDir,
    init: async () => {},
    fn: async () => {
      console.log("Inside provide: Instance.directory =", Instance.directory)

      const targetDir = path.resolve("./test-target")
      // Create the target dir for testing using Bun's API as per style guide
      await Bun.write(path.join(targetDir, "setup.txt"), "")
      // Note: In a real test we should use a more robust setup/teardown or temporary directory

      console.log("Calling chdir to:", targetDir)
      Instance.chdir(targetDir)

      console.log("After chdir: Instance.directory =", Instance.directory)
      console.log("After chdir: Instance.worktree =", Instance.worktree)

      expect(Instance.directory).toBe(targetDir)
      // worktree should be the same as directory if we haven't moved outside it
      expect(Instance.worktree).toBe(targetDir)
    },
  })
})
