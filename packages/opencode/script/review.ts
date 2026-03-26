#!/usr/bin/env bun

import { NodeFileSystem, NodePath } from "@effect/platform-node"
import * as CrossSpawnSpawner from "../src/effect/cross-spawn-spawner"
import { makeRuntime } from "../src/effect/run-service"
import path from "path"
import { Duration, Effect, Fiber, FileSystem, Layer, Schema, Schedule, ServiceMap, Stream } from "effect"
import type { PlatformError } from "effect/PlatformError"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

const Category = Schema.Union([
  Schema.Literal("correctness"),
  Schema.Literal("security"),
  Schema.Literal("maintainability"),
])

const Severity = Schema.Union([Schema.Literal("must-fix"), Schema.Literal("should-fix"), Schema.Literal("suggestion")])

const Confidence = Schema.Union([Schema.Literal("high"), Schema.Literal("medium"), Schema.Literal("low")])

class Base extends Schema.Class<Base>("ReviewBase")({
  ref: Schema.String,
}) {}

class Head extends Schema.Class<Head>("ReviewHead")({
  sha: Schema.String,
  ref: Schema.String,
}) {}

class Pull extends Schema.Class<Pull>("ReviewPull")({
  number: Schema.Number,
  title: Schema.String,
  body: Schema.NullOr(Schema.String),
  head: Head,
  base: Base,
}) {}

class PullFile extends Schema.Class<PullFile>("ReviewPullFile")({
  filename: Schema.String,
  status: Schema.String,
  patch: Schema.optional(Schema.String),
}) {}

class PullContext extends Schema.Class<PullContext>("ReviewPullContext")({
  repo: Schema.String,
  mergeBase: Schema.String,
  pull: Pull,
}) {}

class Finding extends Schema.Class<Finding>("ReviewFinding")({
  category: Category,
  severity: Severity,
  confidence: Confidence,
  file: Schema.String,
  line: Schema.Number,
  summary: Schema.String,
  evidence: Schema.String,
  suggestion: Schema.String,
  introduced: Schema.Boolean,
}) {}

class ReviewError extends Schema.TaggedErrorClass<ReviewError>()("ReviewError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

const PullFiles = Schema.Array(PullFile)
const Findings = Schema.Array(Finding)
const decodePullJson = Schema.decodeSync(Schema.fromJsonString(Pull))
const decodePullFilesJson = Schema.decodeSync(Schema.fromJsonString(PullFiles))
const decodeFindingsJson = Schema.decodeSync(Schema.fromJsonString(Findings))
const encodePullContext = Schema.encodeSync(Schema.fromJsonString(PullContext))
const encodePullFiles = Schema.encodeSync(Schema.fromJsonString(PullFiles))
const encodeFindings = Schema.encodeSync(Schema.fromJsonString(Findings))

const args = parse(process.argv.slice(2))

export namespace Review {
  export interface Interface {
    readonly run: (input: {
      repo: string
      pr: number
      post: boolean
    }) => Effect.Effect<void, ReviewError | PlatformError>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Review") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const root = process.cwd()
      const bin = process.env.OPENCODE_BIN ?? "opencode"

      const note = (text: string) => Effect.sync(() => console.error(`[review] ${text}`))

      const fail = (message: string) => (cause: unknown) =>
        new ReviewError({
          message,
          cause,
        })

      const cmd = Effect.fn("Review.cmd")(function* (file: string, argv: string[], cwd: string) {
        const handle = yield* spawner.spawn(
          ChildProcess.make(file, argv, {
            cwd,
            extendEnv: true,
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
          }),
        )

        const [stdout, stderr, code] = yield* Effect.all(
          [
            Stream.mkString(Stream.decodeText(handle.stdout)),
            Stream.mkString(Stream.decodeText(handle.stderr)),
            handle.exitCode,
          ],
          { concurrency: 3 },
        )

        if (code !== ChildProcessSpawner.ExitCode(0)) {
          return yield* new ReviewError({
            message: `${file} ${argv.join(" ")} failed`,
            cause: new Error(stderr.trim() || stdout.trim() || `exit=${code}`),
          })
        }

        return stdout
      }, Effect.scoped)

      const pull = (text: string) =>
        Effect.try({
          try: () => decodePullJson(text),
          catch: fail("pull decode failed"),
        })

      const files = (text: string) =>
        Effect.try({
          try: () => decodePullFilesJson(text),
          catch: fail("pull files decode failed"),
        })

      const findings = (text: string) =>
        Effect.try({
          try: () => decodeFindingsJson(text),
          catch: fail("findings decode failed"),
        })

      const gh = Effect.fn("Review.gh")(function* (argv: string[]) {
        return yield* cmd("gh", argv, root)
      })

      const git = Effect.fn("Review.git")(function* (argv: string[], cwd: string) {
        return yield* cmd("git", argv, cwd)
      })

      const sync = Effect.fn("Review.sync")(function* (dir: string, box: string) {
        const src = path.join(root, ".opencode", "agents")
        const dst = path.join(dir, ".opencode", "agents")
        yield* fs.makeDirectory(dst, { recursive: true }).pipe(Effect.mapError(fail("create agents dir failed")))

        for (const name of [
          "review-correctness.md",
          "review-security.md",
          "review-maintainability.md",
          "review-verify.md",
        ]) {
          const text = yield* fs.readFileString(path.join(src, name)).pipe(Effect.mapError(fail(`read ${name} failed`)))
          yield* fs.writeFileString(path.join(dst, name), text).pipe(Effect.mapError(fail(`write ${name} failed`)))
        }

        const review = yield* fs
          .readFileString(path.join(root, "REVIEW.md"))
          .pipe(Effect.mapError(fail("read REVIEW.md failed")))
        yield* fs
          .writeFileString(path.join(box, "REVIEW.md"), review)
          .pipe(Effect.mapError(fail("write REVIEW.md failed")))
      })

      const parseText = Effect.fn("Review.parseText")(function* (text: string) {
        const body = text.trim()
        if (!body) return yield* new ReviewError({ message: "review agent returned no text" })

        const clean = strip(body)

        try {
          return decodeFindingsJson(clean)
        } catch {}

        const start = clean.indexOf("[")
        const end = clean.lastIndexOf("]")
        if (start !== -1 && end > start) {
          return yield* findings(clean.slice(start, end + 1))
        }

        return yield* new ReviewError({ message: `could not parse findings JSON\n\n${clean}` })
      })

      const talk = Effect.fn("Review.talk")(function* (agent: string, prompt: string, cwd: string) {
        const out: string[] = []
        const err: string[] = []
        const handle = yield* spawner.spawn(
          ChildProcess.make(bin, ["run", "--agent", agent, "--format", "json", prompt], {
            cwd,
            extendEnv: true,
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
          }),
        )

        const [, , code] = yield* Effect.all(
          [
            handle.stdout.pipe(
              Stream.decodeText(),
              Stream.splitLines,
              Stream.runForEach((line) =>
                Effect.sync(() => {
                  out.push(line)
                  trace(agent, line)
                }),
              ),
            ),
            handle.stderr.pipe(
              Stream.decodeText(),
              Stream.splitLines,
              Stream.runForEach((line) =>
                Effect.sync(() => {
                  err.push(line)
                  if (line.trim()) console.error(`[review:${agent}] ${line}`)
                }),
              ),
            ),
            handle.exitCode,
          ],
          { concurrency: 3 },
        )

        if (code !== ChildProcessSpawner.ExitCode(0)) {
          return yield* new ReviewError({
            message: `${agent} failed`,
            cause: new Error(err.join("\n").trim() || out.join("\n").trim() || `exit=${code}`),
          })
        }

        return out.join("\n")
      }, Effect.scoped)

      const pass = Effect.fn("Review.pass")(function* (agent: string, prompt: string, cwd: string) {
        yield* note(`${agent} tools: read/glob/grep/list allowed; write/edit/bash denied`)
        const raw = yield* talk(agent, prompt, cwd)
        return yield* parseText(collect(raw))
      })

      const job = Effect.fn("Review.job")(function* (
        name: string,
        fx: Effect.Effect<readonly Finding[], ReviewError | PlatformError>,
      ) {
        yield* note(`${name} started`)

        const beat = yield* note(`${name} still running`).pipe(
          Effect.repeat(Schedule.spaced(Duration.seconds(15))),
          Effect.delay(Duration.seconds(15)),
          Effect.forkScoped,
        )

        const out = yield* fx.pipe(
          Effect.timeout(Duration.minutes(10)),
          Effect.catchTag("TimeoutError", () =>
            Effect.fail(new ReviewError({ message: `${name} timed out after 600s` })),
          ),
          Effect.ensuring(Fiber.interrupt(beat)),
        )

        yield* note(`${name} finished (${out.length} findings)`)
        return out
      }, Effect.scoped)

      const safe = (name: string, fx: Effect.Effect<readonly Finding[], ReviewError | PlatformError>) =>
        fx.pipe(Effect.catch((err) => note(`pass failed: ${name}: ${err.message}`).pipe(Effect.as([] as const))))

      const inline = Effect.fn("Review.inline")(function* (repo: string, pr: number, sha: string, item: Finding) {
        yield* gh([
          "api",
          "--method",
          "POST",
          "-H",
          "Accept: application/vnd.github+json",
          "-H",
          "X-GitHub-Api-Version: 2022-11-28",
          `/repos/${repo}/pulls/${pr}/comments`,
          "-f",
          `body=${body(item)}`,
          "-f",
          `commit_id=${sha}`,
          "-f",
          `path=${item.file}`,
          "-F",
          `line=${Math.trunc(item.line)}`,
          "-f",
          "side=RIGHT",
        ])
      })

      const top = Effect.fn("Review.top")(function* (repo: string, pr: number, text: string) {
        yield* gh(["pr", "comment", String(pr), "--repo", repo, "--body", text])
      })

      const run = Effect.fn("Review.run")(function* (input: { repo: string; pr: number; post: boolean }) {
        yield* note(`loading PR #${input.pr}`)
        const data = yield* gh(["api", `/repos/${input.repo}/pulls/${input.pr}`]).pipe(Effect.flatMap(pull))
        const list = yield* gh(["api", `/repos/${input.repo}/pulls/${input.pr}/files?per_page=100`]).pipe(
          Effect.flatMap(files),
        )

        const tmp = yield* fs
          .makeTempDirectoryScoped({ prefix: "opencode-review-" })
          .pipe(Effect.mapError(fail("create temp dir failed")))
        const dir = path.join(tmp, `pr-${input.pr}`)

        yield* note("preparing worktree")
        yield* git(
          ["fetch", "origin", data.base.ref, `refs/pull/${input.pr}/head:refs/remotes/origin/pr-${input.pr}`],
          root,
        )
        yield* Effect.acquireRelease(
          git(["worktree", "add", "--detach", dir, `refs/remotes/origin/pr-${input.pr}`], root),
          () => git(["worktree", "remove", "--force", dir], root).pipe(Effect.catch(() => Effect.void)),
        )

        const base = (yield* git(["merge-base", `origin/${data.base.ref}`, "HEAD"], dir)).trim()
        const diff = yield* git(["diff", "--unified=3", `${base}...HEAD`], dir)
        const box = path.join(dir, ".opencode-review")

        yield* fs.makeDirectory(box, { recursive: true }).pipe(Effect.mapError(fail("create review dir failed")))
        yield* sync(dir, box)
        yield* fs
          .writeFileString(
            path.join(box, "pr.json"),
            encodePullContext(
              new PullContext({
                repo: input.repo,
                mergeBase: base,
                pull: data,
              }),
            ),
          )
          .pipe(Effect.mapError(fail("write pr.json failed")))
        yield* fs
          .writeFileString(path.join(box, "files.json"), encodePullFiles(list))
          .pipe(Effect.mapError(fail("write files.json failed")))
        yield* fs
          .writeFileString(path.join(box, "diff.patch"), diff)
          .pipe(Effect.mapError(fail("write diff.patch failed")))

        const out = yield* Effect.all(
          [
            safe("correctness", job("correctness", pass("review-correctness", correctness(data, list), dir))),
            safe("security", job("security", pass("review-security", security(data, list), dir))),
            safe(
              "maintainability",
              job("maintainability", pass("review-maintainability", maintainability(data, list), dir)),
            ),
          ],
          { concurrency: 3 },
        )

        const merged = dedupe(out.flatMap((item) => [...item]))
        yield* fs
          .writeFileString(path.join(box, "candidates.json"), encodeFindings(merged))
          .pipe(Effect.mapError(fail("write candidates.json failed")))

        const kept = merged.length
          ? dedupe(yield* job("verifier", pass("review-verify", verify(data, merged), dir)))
          : []
        const ranges = new Map(list.map((item) => [item.filename, hunks(item.patch)]))
        const notes = kept.filter((item) => inDiff(ranges.get(item.file), item.line))
        const rest = kept.filter((item) => !inDiff(ranges.get(item.file), item.line))

        if (!input.post) {
          yield* Effect.sync(() => print(kept, notes, rest))
          return
        }

        if (!kept.length) {
          yield* top(input.repo, input.pr, "lgtm")
          return
        }

        yield* Effect.all(
          notes.map((item) => inline(input.repo, input.pr, data.head.sha, item)),
          { concurrency: 1 },
        )
        if (rest.length) yield* top(input.repo, input.pr, summary(rest))
      })

      return Service.of({
        run: (input) => run(input).pipe(Effect.scoped),
      })
    }),
  )

  export const defaultLayer = layer.pipe(
    Layer.provide(CrossSpawnSpawner.layer),
    Layer.provide(NodeFileSystem.layer),
    Layer.provide(NodePath.layer),
  )

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export function run(input: { repo: string; pr: number; post: boolean }) {
    return runPromise((svc) => svc.run(input))
  }
}

await Review.run(args)

function parse(argv: string[]) {
  let repo: string | undefined
  let pr: number | undefined
  let post = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--repo") repo = argv[++i]
    if (arg === "--pr") pr = Number(argv[++i])
    if (arg === "--post") post = true
  }

  if (!repo) throw new Error("Missing --repo")
  if (!pr) throw new Error("Missing --pr")
  return { repo, pr, post }
}

function collect(raw: string) {
  const seen = new Set<string>()
  const out: string[] = []

  for (const row of raw.split(/\r?\n/)) {
    if (!row.trim()) continue

    let item: unknown
    try {
      item = JSON.parse(row)
    } catch {
      continue
    }

    if (!item || typeof item !== "object" || !("type" in item) || item.type !== "text") continue
    if (!("part" in item) || !item.part || typeof item.part !== "object") continue

    const part = item.part as { id?: string; text?: string }
    if (!part.id || seen.has(part.id)) continue
    seen.add(part.id)
    if (typeof part.text === "string") out.push(part.text)
  }

  return out.join("\n")
}

function trace(agent: string, row: string) {
  if (!row.trim()) return

  let item: unknown
  try {
    item = JSON.parse(row)
  } catch {
    console.error(`[review:${agent}] ${row}`)
    return
  }

  if (!item || typeof item !== "object") return
  const type = "type" in item && typeof item.type === "string" ? item.type : undefined
  if (!type) return
  if (type === "tool_use") {
    const part = "part" in item && item.part && typeof item.part === "object" ? item.part : undefined
    const tool = part && "tool" in part && typeof part.tool === "string" ? part.tool : "tool"
    const state = part && "state" in part && part.state && typeof part.state === "object" ? part.state : undefined
    const input = state && "input" in state ? brief(state.input) : ""
    console.error(`[review:${agent}] ${tool}${input ? ` ${input}` : ""}`)
    return
  }
  if (type === "step_start") {
    console.error(`[review:${agent}] step started`)
    return
  }
  if (type === "step_finish") {
    const part = "part" in item && item.part && typeof item.part === "object" ? item.part : undefined
    const reason = part && "reason" in part && typeof part.reason === "string" ? part.reason : "step"
    console.error(`[review:${agent}] step finished (${reason})`)
  }
}

function brief(input: unknown) {
  if (!input || typeof input !== "object") return ""
  if ("filePath" in input && typeof input.filePath === "string") return input.filePath
  if ("path" in input && typeof input.path === "string") return input.path
  if ("pattern" in input && typeof input.pattern === "string") return input.pattern
  if ("command" in input && typeof input.command === "string") return input.command
  if ("include" in input && typeof input.include === "string") return input.include
  return ""
}

function strip(text: string) {
  if (!text.startsWith("```") || !text.endsWith("```")) return text
  return text
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/\n?```$/, "")
    .trim()
}

function correctness(data: Pull, list: readonly PullFile[]) {
  return [
    `Review pull request #${data.number}: ${data.title}.`,
    `Base ref: ${data.base.ref}. Head ref: ${data.head.ref}.`,
    `Changed files: ${list.map((item) => item.filename).join(", ")}.`,
    "Read `.opencode-review/REVIEW.md` before reviewing.",
    "Start with the diff. Use the rest of the repo only for targeted confirmation.",
    "Avoid broad exploration. Follow direct references only.",
    "Find correctness bugs, regressions, missing edge-case handling, broken invariants, and unsafe assumptions.",
    "Only report issues introduced or exposed by this pull request.",
  ].join("\n")
}

function security(data: Pull, list: readonly PullFile[]) {
  return [
    `Review pull request #${data.number}: ${data.title}.`,
    `Base ref: ${data.base.ref}. Head ref: ${data.head.ref}.`,
    `Changed files: ${list.map((item) => item.filename).join(", ")}.`,
    "Read `.opencode-review/REVIEW.md` before reviewing.",
    "Start with the diff. Use the rest of the repo only for targeted confirmation.",
    "Avoid broad exploration. Follow direct auth, validation, storage, or transport links only.",
    "Find concrete security issues such as missing validation, unsafe auth checks, secrets exposure, or data leaks.",
    "Only report issues introduced or exposed by this pull request.",
  ].join("\n")
}

function maintainability(data: Pull, list: readonly PullFile[]) {
  return [
    `Review pull request #${data.number}: ${data.title}.`,
    `Base ref: ${data.base.ref}. Head ref: ${data.head.ref}.`,
    `Changed files: ${list.map((item) => item.filename).join(", ")}.`,
    "Read `.opencode-review/REVIEW.md` before reviewing.",
    "Start with the diff. Use the rest of the repo only for targeted confirmation.",
    "Avoid broad exploration. Focus on maintainability issues made visible by the changed files.",
    "Find high-signal maintainability issues that clearly violate repo conventions or make future bugs likely.",
    "Do not nitpick harmless style differences.",
  ].join("\n")
}

function verify(data: Pull, list: readonly Finding[]) {
  return [
    `Verify review findings for pull request #${data.number}: ${data.title}.`,
    `Candidates: ${list.length}.`,
    "Inspect the cited file first and expand only if needed to confirm or reject the finding.",
    "Reject anything vague, duplicated, unsupported, or not attributable to the pull request.",
  ].join("\n")
}

function dedupe(list: readonly Finding[]) {
  const seen = new Set<string>()
  return order(list).filter((item) => {
    const key = [item.category, item.file, Math.trunc(item.line), item.summary.trim().toLowerCase()].join(":")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function order(list: readonly Finding[]) {
  const rank = {
    "must-fix": 0,
    "should-fix": 1,
    suggestion: 2,
  }
  return [...list].sort((a, b) => {
    const left = rank[a.severity] - rank[b.severity]
    if (left) return left
    return a.file.localeCompare(b.file) || a.line - b.line
  })
}

function hunks(patch?: string) {
  if (!patch) return [] as [number, number][]
  const out: [number, number][] = []
  let line = 0
  let start = -1
  let end = -1

  for (const row of patch.split("\n")) {
    if (row.startsWith("@@")) {
      push(out, start, end)
      start = -1
      end = -1
      const hit = /\+([0-9]+)(?:,([0-9]+))?/.exec(row)
      line = hit ? Number(hit[1]) : 0
      continue
    }

    if (row.startsWith("+") && !row.startsWith("+++")) {
      start = start === -1 ? line : start
      end = line
      line += 1
      continue
    }

    if (row.startsWith("-") && !row.startsWith("---")) continue

    push(out, start, end)
    start = -1
    end = -1
    line += 1
  }

  push(out, start, end)
  return out
}

function push(out: [number, number][], start: number, end: number) {
  if (start === -1 || end === -1) return
  const prev = out.at(-1)
  if (prev && prev[1] + 1 >= start) {
    prev[1] = Math.max(prev[1], end)
    return
  }
  out.push([start, end])
}

function inDiff(list: [number, number][] | undefined, line: number) {
  return !!list?.some((item) => line >= item[0] && line <= item[1])
}

function body(item: Finding) {
  const out = [`[${item.severity}] ${item.summary}`, "", item.evidence]
  if (item.suggestion.trim()) out.push("", `Suggestion: ${item.suggestion.trim()}`)
  return out.join("\n")
}

function summary(list: readonly Finding[]) {
  const head = "OpenCode review found additional PR-relevant issues that could not be placed on changed lines:"
  const body = order(list).map(
    (item) => `- [${item.severity}] \`${item.file}:${Math.trunc(item.line)}\` ${item.summary}`,
  )
  return [head, "", ...body].join("\n")
}

function print(all: readonly Finding[], notes: readonly Finding[], rest: readonly Finding[]) {
  console.log("# OpenCode Review")
  console.log()
  console.log(`- total: ${all.length}`)
  console.log(`- inline-ready: ${notes.length}`)
  console.log(`- summary-only: ${rest.length}`)
  console.log()

  for (const item of order(all)) {
    console.log(`- [${item.severity}] ${item.file}:${Math.trunc(item.line)} ${item.summary}`)
    console.log(`  ${item.evidence}`)
    if (item.suggestion.trim()) console.log(`  suggestion: ${item.suggestion.trim()}`)
  }
}
