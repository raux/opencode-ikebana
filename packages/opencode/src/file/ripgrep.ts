import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import z from "zod"
import { Effect, Layer, ServiceMap } from "effect"
import { ripgrep } from "ripgrep"
import { makeRuntime } from "@/effect/run-service"
import { Filesystem } from "@/util/filesystem"
import { Log } from "@/util/log"

export namespace Ripgrep {
  const log = Log.create({ service: "ripgrep" })

  const Stats = z.object({
    elapsed: z.object({
      secs: z.number(),
      nanos: z.number(),
      human: z.string(),
    }),
    searches: z.number(),
    searches_with_match: z.number(),
    bytes_searched: z.number(),
    bytes_printed: z.number(),
    matched_lines: z.number(),
    matches: z.number(),
  })

  const Begin = z.object({
    type: z.literal("begin"),
    data: z.object({
      path: z.object({
        text: z.string(),
      }),
    }),
  })

  export const Match = z.object({
    type: z.literal("match"),
    data: z.object({
      path: z.object({
        text: z.string(),
      }),
      lines: z.object({
        text: z.string(),
      }),
      line_number: z.number(),
      absolute_offset: z.number(),
      submatches: z.array(
        z.object({
          match: z.object({
            text: z.string(),
          }),
          start: z.number(),
          end: z.number(),
        }),
      ),
    }),
  })

  const End = z.object({
    type: z.literal("end"),
    data: z.object({
      path: z.object({
        text: z.string(),
      }),
      binary_offset: z.number().nullable(),
      stats: Stats,
    }),
  })

  const Summary = z.object({
    type: z.literal("summary"),
    data: z.object({
      elapsed_total: z.object({
        human: z.string(),
        nanos: z.number(),
        secs: z.number(),
      }),
      stats: Stats,
    }),
  })

  const Result = z.union([Begin, Match, End, Summary])

  export type Result = z.infer<typeof Result>
  export type Match = z.infer<typeof Match>
  export type Begin = z.infer<typeof Begin>
  export type End = z.infer<typeof End>
  export type Summary = z.infer<typeof Summary>
  export type Row = Match["data"]

  export interface FilesInput {
    cwd: string
    glob?: string[]
    hidden?: boolean
    follow?: boolean
    maxDepth?: number
    signal?: AbortSignal
  }

  export interface SearchInput {
    cwd: string
    pattern: string
    glob?: string[]
    limit?: number
    follow?: boolean
    signal?: AbortSignal
  }

  export interface TreeInput {
    cwd: string
    limit?: number
    signal?: AbortSignal
  }

  export interface Interface {
    readonly files: (input: FilesInput) => Effect.Effect<AsyncIterable<string>>
    readonly tree: (input: TreeInput) => Effect.Effect<string>
    readonly search: (input: SearchInput) => Effect.Effect<Row[]>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Ripgrep") {}

  type Run = { kind: "files" | "search"; cwd: string; args: string[] }

  type WorkerResult = {
    type: "result"
    code: number
    stdout: string
    stderr: string
  }

  type WorkerLine = {
    type: "line"
    line: string
  }

  type WorkerDone = {
    type: "done"
    code: number
    stderr: string
  }

  type WorkerError = {
    type: "error"
    error: {
      message: string
      name?: string
      stack?: string
    }
  }

  function env() {
    const env = Object.fromEntries(
      Object.entries(process.env).filter((item): item is [string, string] => item[1] !== undefined),
    )
    delete env.RIPGREP_CONFIG_PATH
    return env
  }

  function text(input: unknown) {
    if (typeof input === "string") return input
    if (input instanceof ArrayBuffer) return Buffer.from(input).toString()
    if (ArrayBuffer.isView(input)) return Buffer.from(input.buffer, input.byteOffset, input.byteLength).toString()
    return String(input)
  }

  function toError(input: unknown) {
    if (input instanceof Error) return input
    if (typeof input === "string") return new Error(input)
    return new Error(String(input))
  }

  function abort(signal?: AbortSignal) {
    const err = signal?.reason
    if (err instanceof Error) return err
    const out = new Error("Aborted")
    out.name = "AbortError"
    return out
  }

  function error(stderr: string, code: number) {
    const err = new Error(stderr.trim() || `ripgrep failed with code ${code}`)
    err.name = "RipgrepError"
    return err
  }

  function clean(file: string) {
    return file.replace(/^\.[\\/]/, "")
  }

  function row(data: Row): Row {
    return {
      ...data,
      path: {
        ...data.path,
        text: clean(data.path.text),
      },
    }
  }

  function opts(cwd: string) {
    return {
      env: env(),
      preopens: { ".": cwd },
    }
  }

  async function check(cwd: string) {
    const stat = await fs.stat(cwd).catch(() => undefined)
    if (stat?.isDirectory()) return
    throw Object.assign(new Error(`No such file or directory: '${cwd}'`), {
      code: "ENOENT",
      errno: -2,
      path: cwd,
    })
  }

  function filesArgs(input: FilesInput) {
    const args = ["--files", "--glob=!.git/*"]
    if (input.follow) args.push("--follow")
    if (input.hidden !== false) args.push("--hidden")
    if (input.maxDepth !== undefined) args.push(`--max-depth=${input.maxDepth}`)
    if (input.glob) {
      for (const glob of input.glob) {
        args.push(`--glob=${glob}`)
      }
    }
    args.push(".")
    return args
  }

  function searchArgs(input: SearchInput) {
    const args = ["--json", "--hidden", "--glob=!.git/*"]
    if (input.follow) args.push("--follow")
    if (input.glob) {
      for (const glob of input.glob) {
        args.push(`--glob=${glob}`)
      }
    }
    if (input.limit) args.push(`--max-count=${input.limit}`)
    args.push("--", input.pattern, ".")
    return args
  }

  function parse(stdout: string) {
    return stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => Result.parse(JSON.parse(line)))
      .flatMap((item) => (item.type === "match" ? [row(item.data)] : []))
  }

  async function target() {
    const js = new URL("./ripgrep.worker.js", import.meta.url)
    if (await Filesystem.exists(fileURLToPath(js))) return js
    return new URL("./ripgrep.worker.ts", import.meta.url)
  }

  function worker() {
    return target().then((file) => new Worker(file, { env: env() }))
  }

  function queue<T>() {
    const vals: T[] = []
    const waits: Array<{
      ok: (value: IteratorResult<T>) => void
      fail: (err: unknown) => void
    }> = []
    let err: unknown
    let done = false

    return {
      push(value: T) {
        if (done || err) return
        const item = waits.shift()
        if (item) {
          item.ok({ value, done: false })
          return
        }
        vals.push(value)
      },
      fail(cause: unknown) {
        if (done || err) return
        err = cause
        for (const item of waits.splice(0)) item.fail(cause)
      },
      end() {
        if (done || err) return
        done = true
        for (const item of waits.splice(0)) item.ok({ value: undefined, done: true })
      },
      next(): Promise<IteratorResult<T>> {
        if (vals.length) return Promise.resolve({ value: vals.shift()!, done: false })
        if (err) return Promise.reject(err)
        if (done) return Promise.resolve({ value: undefined, done: true })
        return new Promise((ok, fail) => waits.push({ ok, fail }))
      },
    }
  }

  async function searchDirect(input: SearchInput) {
    const ret = await ripgrep(searchArgs(input), {
      buffer: true,
      ...opts(input.cwd),
    })

    const out = ret.stdout ?? ""
    if (ret.code === 1) return []
    if (ret.code !== 0 && !out.trim()) return []
    return parse(out)
  }

  async function searchWorker(input: SearchInput) {
    if (input.signal?.aborted) throw abort(input.signal)

    return new Promise<Row[]>(async (resolve, reject) => {
      const w = await worker().catch(reject)
      if (!w) return

      let open = true
      const stop = () => {
        if (!open) return
        open = false
        input.signal?.removeEventListener("abort", onabort)
        w.terminate()
      }
      const halt = (err: unknown) => {
        stop()
        reject(toError(err))
      }
      const onabort = () => {
        stop()
        reject(abort(input.signal))
      }

      w.onerror = (evt) => halt(evt.error ?? new Error(evt.message))
      w.onmessage = (evt: MessageEvent<WorkerResult | WorkerError>) => {
        const msg = evt.data
        if (msg.type === "error") {
          halt(Object.assign(new Error(msg.error.message), msg.error))
          return
        }

        stop()
        if (msg.code === 1) {
          resolve([])
          return
        }
        if (msg.code !== 0 && !msg.stdout.trim()) {
          resolve([])
          return
        }
        resolve(parse(msg.stdout))
      }

      input.signal?.addEventListener("abort", onabort, { once: true })
      w.postMessage({
        kind: "search",
        cwd: input.cwd,
        args: searchArgs(input),
      } satisfies Run)
    })
  }

  function filesDirect(input: FilesInput) {
    const chan = queue<string>()
    let buf = ""
    let err = ""

    const out = {
      write(chunk: unknown) {
        buf += text(chunk)
        const lines = buf.split(/\r?\n/)
        buf = lines.pop() || ""
        for (const line of lines) {
          if (line) chan.push(clean(line))
        }
      },
    }

    const stderr = {
      write(chunk: unknown) {
        err += text(chunk)
      },
    }

    const run = async () => {
      await check(input.cwd)
      const ret = await ripgrep(filesArgs(input), {
        stdout: out,
        stderr,
        ...opts(input.cwd),
      })
      if (buf) chan.push(clean(buf))
      if (ret.code === 0 || ret.code === 1) {
        chan.end()
        return
      }
      chan.fail(error(err, ret.code ?? 1))
    }

    void run().catch((err) => chan.fail(err))

    return {
      async *[Symbol.asyncIterator]() {
        while (true) {
          const item = await chan.next()
          if (item.done) break
          yield item.value
        }
      },
    } satisfies AsyncIterable<string>
  }

  async function filesWorker(input: FilesInput) {
    if (input.signal?.aborted) throw abort(input.signal)

    const chan = queue<string>()
    const w = await worker()

    let open = true
    const stop = () => {
      if (!open) return
      open = false
      input.signal?.removeEventListener("abort", onabort)
      w.terminate()
    }
    const onabort = () => {
      stop()
      chan.fail(abort(input.signal))
    }

    w.onerror = (evt) => {
      stop()
      chan.fail(evt.error ?? new Error(evt.message))
    }

    w.onmessage = (evt: MessageEvent<WorkerLine | WorkerDone | WorkerError>) => {
      const msg = evt.data
      if (msg.type === "line") {
        chan.push(msg.line)
        return
      }
      if (msg.type === "error") {
        stop()
        chan.fail(Object.assign(new Error(msg.error.message), msg.error))
        return
      }

      stop()
      if (msg.code === 0 || msg.code === 1) {
        chan.end()
        return
      }
      chan.fail(error(msg.stderr, msg.code))
    }

    input.signal?.addEventListener("abort", onabort, { once: true })
    w.postMessage({
      kind: "files",
      cwd: input.cwd,
      args: filesArgs(input),
    } satisfies Run)

    return {
      async *[Symbol.asyncIterator]() {
        try {
          while (true) {
            const item = await chan.next()
            if (item.done) break
            yield item.value
          }
        } finally {
          stop()
        }
      },
    } satisfies AsyncIterable<string>
  }

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const files: Interface["files"] = Effect.fn("Ripgrep.files")(function* (input: FilesInput) {
        const useWorker = !!input.signal && typeof Worker !== "undefined"
        if (!useWorker && input.signal) {
          log.warn("worker unavailable, ripgrep abort disabled")
        }
        return yield* Effect.promise(() => (useWorker ? filesWorker(input) : Promise.resolve(filesDirect(input))))
      })

      const tree: Interface["tree"] = Effect.fn("Ripgrep.tree")(function* (input: TreeInput) {
        log.info("tree", input)
        const iter = yield* files({ cwd: input.cwd, signal: input.signal })
        const list = yield* Effect.promise(() => Array.fromAsync(iter))

        interface Node {
          name: string
          children: Map<string, Node>
        }

        function child(node: Node, name: string) {
          const item = node.children.get(name)
          if (item) return item
          const next = { name, children: new Map() }
          node.children.set(name, next)
          return next
        }

        function count(node: Node): number {
          return Array.from(node.children.values()).reduce((sum, child) => sum + 1 + count(child), 0)
        }

        const root: Node = { name: "", children: new Map() }
        for (const file of list) {
          if (file.includes(".opencode")) continue
          const parts = file.split(path.sep)
          if (parts.length < 2) continue
          let node = root
          for (const part of parts.slice(0, -1)) {
            node = child(node, part)
          }
        }

        const total = count(root)
        const limit = input.limit ?? total
        const lines: string[] = []
        const queue: Array<{ node: Node; path: string }> = Array.from(root.children.values())
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((node) => ({ node, path: node.name }))

        let used = 0
        for (let i = 0; i < queue.length && used < limit; i++) {
          const item = queue[i]
          lines.push(item.path)
          used++
          queue.push(
            ...Array.from(item.node.children.values())
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((node) => ({ node, path: `${item.path}/${node.name}` })),
          )
        }

        if (total > used) lines.push(`[${total - used} truncated]`)
        return lines.join("\n")
      })

      const search: Interface["search"] = Effect.fn("Ripgrep.search")(function* (input: SearchInput) {
        const useWorker = !!input.signal && typeof Worker !== "undefined"
        if (!useWorker && input.signal) {
          log.warn("worker unavailable, ripgrep abort disabled")
        }
        return yield* Effect.promise(() => (useWorker ? searchWorker(input) : searchDirect(input)))
      })

      return Service.of({ files, tree, search })
    }),
  )

  export const defaultLayer = layer

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export function files(input: FilesInput) {
    return runPromise((svc) => svc.files(input))
  }

  export function tree(input: TreeInput) {
    return runPromise((svc) => svc.tree(input))
  }

  export function search(input: SearchInput) {
    return runPromise((svc) => svc.search(input))
  }
}
