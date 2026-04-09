## Summary

This refactor moves the TUI toward a single source of truth for project and workspace state, and aligns event handling around a global event stream instead of per-directory subscriptions.

The main goal is to make workspace switching and session loading behave consistently across the TUI, while simplifying the data flow between the frontend, worker transport, and backend.

## Why

The previous shape was splitting related state across multiple places:

- some workspace/path state lived in sync state
- some UI behavior depended on route state
- event consumers were effectively relying on instance-scoped subscriptions

That made workspace-aware behavior harder to reason about and more fragile when switching contexts.

This change centralizes the active project/workspace/path state, makes sync react to that state instead of owning it, and updates the event pipeline so the backend emits richer global events and the TUI filters them based on the current context. The intent is to make the system easier to evolve as workspace support expands.

## What Changed

- centralized active project/workspace/path state in the TUI
- made sync derive from that state and re-bootstrap when the active workspace changes
- switched TUI event consumption to a global event stream filtered client-side
- propagated workspace/project metadata through the backend event path and runtime context
- updated the SDK/OpenAPI contract to reflect the richer global event shape
- added targeted TUI tests around workspace-driven sync behavior and event filtering

## Risk

This touches several cross-cutting paths, so the main risks are around behavior rather than typing:

- workspace changes may still expose subtle ordering/race issues if older async bootstrap work finishes after newer state is selected
- event filtering is now more centralized, which is good, but also means mistakes there can hide or misroute UI updates
- session state now depends more heavily on the active workspace context being correct at the right time
- backend/frontend assumptions about global event metadata need to stay aligned, or certain updates may quietly stop appearing in the TUI

Overall, the biggest risk is regressions during workspace transitions rather than steady-state usage.

## Validation

- added focused tests for reactive sync behavior on workspace changes
- added focused tests for `useEvent()` filtering behavior
- ran `bun typecheck`
- ran targeted TUI tests for the new coverage
