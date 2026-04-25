import z from "zod"
import { Effect } from "effect"
import { Tool } from "./tool"
import { Snapshot } from "../snapshot"
import { Instance } from "../project/instance"
import DESCRIPTION from "./git_undo.txt"

const Parameters = z.object({
  action: z
    .enum(["snapshot", "undo", "list"])
    .describe(
      "The action to perform: snapshot (create checkpoint), undo (revert to last snapshot), or list (show available snapshots)",
    ),
  snapshotId: z
    .string()
    .optional()
    .describe("Specific snapshot ID to undo to (required for undo action when specifying a particular snapshot)"),
})

export const GitUndoTool = Tool.define(
  "git_undo",
  Effect.gen(function* () {
    const snapshot = yield* Snapshot.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          switch (params.action) {
            case "snapshot": {
              // Create a snapshot of current state
              const hash = yield* snapshot.track()
              if (hash === undefined) {
                return {
                  title: "Git Undo Tool",
                  metadata: {} as { snapshotId?: string; filesReverted?: number; currentSnapshot?: string },
                  output:
                    "Failed to create snapshot. Snapshot functionality may be disabled or not available in this workspace.",
                }
              }
              return {
                title: "Git Undo Tool - Snapshot Created",
                metadata: {
                  snapshotId: hash,
                } as { snapshotId?: string; filesReverted?: number; currentSnapshot?: string },
                output: `Snapshot created successfully: ${hash}\nUse this ID to undo changes later with the 'undo' action.`,
              }
            }

            case "undo": {
              let targetSnapshot: string | undefined

              if (params.snapshotId) {
                // Use specified snapshot ID
                targetSnapshot = params.snapshotId
              } else {
                // Get the most recent snapshot
                const hash = yield* snapshot.track()
                if (hash === undefined) {
                  return {
                    title: "Git Undo Tool",
                    metadata: {} as { snapshotId?: string; filesReverted?: number; currentSnapshot?: string },
                    output:
                      "Failed to create snapshot for comparison. Snapshot functionality may be disabled or not available in this workspace.",
                  }
                }
                targetSnapshot = hash
              }

              if (!targetSnapshot) {
                return {
                  title: "Git Undo Tool",
                  metadata: {} as { snapshotId?: string; filesReverted?: number; currentSnapshot?: string },
                  output: "No snapshots available. Create a snapshot first using the 'snapshot' action.",
                }
              }

              // Get the patch for the target snapshot
              const patchResult = yield* snapshot.patch(targetSnapshot)

              if (patchResult.files.length === 0) {
                return {
                  title: "Git Undo Tool",
                  metadata: {} as { snapshotId?: string; filesReverted?: number; currentSnapshot?: string },
                  output: `No changes found in snapshot ${targetSnapshot}. Nothing to undo.`,
                }
              }

              // Revert the changes
              yield* snapshot.revert([patchResult])

              return {
                title: "Git Undo Tool - Changes Reverted",
                metadata: {
                  snapshotId: targetSnapshot,
                  filesReverted: patchResult.files.length,
                } as { snapshotId?: string; filesReverted?: number; currentSnapshot?: string },
                output: `Successfully reverted ${patchResult.files.length} file(s) to snapshot ${targetSnapshot}:\n${patchResult.files.map((f) => `  ${f}`).join("\n")}`,
              }
            }

            case "list": {
              // For list action, we'll show recent snapshots by creating a temporary one
              // and then getting diff to see what's changed
              const currentHash = yield* snapshot.track()
              if (currentHash === undefined) {
                return {
                  title: "Git Undo Tool",
                  metadata: {} as { snapshotId?: string; filesReverted?: number; currentSnapshot?: string },
                  output: "Snapshot functionality is not available in this workspace.",
                }
              }

              // Try to get some history - this is a simplified approach
              // In a full implementation, we might want to maintain a history of snapshots
              return {
                title: "Git Undo Tool - Available Snapshots",
                metadata: {
                  currentSnapshot: currentHash,
                } as { snapshotId?: string; filesReverted?: number; currentSnapshot?: string },
                output: `Current workspace snapshot: ${currentHash}\n\nTo create a snapshot for future undo operations, use the 'snapshot' action.\nTo undo changes to the current state, use the 'undo' action (optionally specifying a snapshot ID).`,
              }
            }

            default: {
              return {
                title: "Git Undo Tool",
                metadata: {} as { snapshotId?: string; filesReverted?: number; currentSnapshot?: string },
                output: `Unknown action: ${params.action}. Valid actions are: snapshot, undo, list.`,
              }
            }
          }
        }),
    }
  }),
)
