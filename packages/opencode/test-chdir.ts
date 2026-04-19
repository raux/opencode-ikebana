import { Instance } from "./src/project/instance"
import { Filesystem } from "./src/util/filesystem"
import * as path from "path"

async function testChdir() {
  const initialDir = path.resolve("./")
  console.log("Initial directory:", initialDir)

  // We need to bootstrap an instance first
  await Instance.provide({
    directory: initialDir,
    init: async () => {},
    fn: async () => {
      console.log("Inside provide: Instance.directory =", Instance.directory)

      const targetDir = path.resolve("./test-target")
      // Create the target dir for testing
      // (In a real test we'd use a proper setup/teardown)

      console.log("Calling chdir to:", targetDir)
      Instance.chdir(targetDir)

      console.log("After chdir: Instance.directory =", Instance.directory)
      console.log("After chdir: Instance.worktree =", Instance.worktree)
    },
  })
}

testChdir().catch((err) => {
  console.error(err)
  process.exit(1)
})
