# Review Guidelines

## Prioritize

- correctness bugs, regressions, and unsafe edge cases
- security issues with concrete impact
- maintainability problems that clearly violate repo conventions

## Flag

- unnecessary `any` in new code when a precise type is practical
- deep nesting when early returns would make the flow clearer
- duplicated logic that should obviously reuse existing helpers
- new routes, migrations, or persistence changes that look untested or unsafe

## Skip

- harmless formatting differences
- stylistic nits without clear repo guidance
- optional micro-optimizations without user impact
- pre-existing issues unrelated to the pull request
