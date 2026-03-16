import path from "path"
import { Effect, Layer, Schema, ServiceMap } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { Global } from "../global"
import { Log } from "../util/log"
import { Filesystem } from "../util/filesystem"
import { withTransientReadRetry } from "@/util/effect-http-client"

class IndexSkill extends Schema.Class<IndexSkill>("IndexSkill")({
  name: Schema.String,
  description: Schema.String,
  files: Schema.Array(Schema.String),
}) {}

class Index extends Schema.Class<Index>("Index")({
  skills: Schema.Array(IndexSkill),
}) {}

export namespace Discovery {
  export function dir() {
    return path.join(Global.Path.cache, "skills")
  }
}

export namespace DiscoveryService {
  export interface Service {
    readonly pull: (url: string) => Effect.Effect<string[]>
  }
}

export class DiscoveryService extends ServiceMap.Service<DiscoveryService, DiscoveryService.Service>()(
  "@opencode/SkillDiscovery",
) {
  static readonly layer = Layer.effect(
    DiscoveryService,
    Effect.gen(function* () {
      const log = Log.create({ service: "skill-discovery" })
      const http = withTransientReadRetry(yield* HttpClient.HttpClient)

      const get = Effect.fn("DiscoveryService.get")((url: string, dest: string) =>
        Effect.gen(function* () {
          if (yield* Effect.promise(() => Filesystem.exists(dest))) return true

          const req = HttpClientRequest.get(url)
          const response = yield* http.execute(req).pipe(
            Effect.catch((err) => {
              log.error("failed to download", { url, err })
              return Effect.succeed(null)
            }),
          )
          if (!response) return false

          const ok = yield* HttpClientResponse.filterStatusOk(response).pipe(
            Effect.catch(() => {
              log.error("failed to download", { url, status: response.status })
              return Effect.succeed(null)
            }),
          )
          if (!ok) return false

          const body = yield* ok.arrayBuffer.pipe(
            Effect.catch((err) => {
              log.error("failed to read download body", { url, err })
              return Effect.succeed(null)
            }),
          )
          if (!body) return false

          yield* Effect.promise(() => Filesystem.write(dest, Buffer.from(body)))
          return true
        }),
      )

      const pull: DiscoveryService.Service["pull"] = Effect.fn("DiscoveryService.pull")(function* (url: string) {
        const base = url.endsWith("/") ? url : `${url}/`
        const index = new URL("index.json", base).href
        const cache = Discovery.dir()
        const host = base.slice(0, -1)

        log.info("fetching index", { url: index })

        const req = HttpClientRequest.get(index).pipe(HttpClientRequest.acceptJson)
        const response = yield* http.execute(req).pipe(
          Effect.catch((err) => {
            log.error("failed to fetch index", { url: index, err })
            return Effect.succeed(null)
          }),
        )
        if (!response) return Array<string>()

        const ok = yield* HttpClientResponse.filterStatusOk(response).pipe(
          Effect.catch(() => {
            log.error("failed to fetch index", { url: index, status: response.status })
            return Effect.succeed(null)
          }),
        )
        if (!ok) return Array<string>()

        const data = yield* HttpClientResponse.schemaBodyJson(Index)(ok).pipe(
          Effect.catch((err) => {
            log.error("failed to parse index", { url: index, err })
            return Effect.succeed(null)
          }),
        )
        if (!data) {
          log.warn("invalid index format", { url: index })
          return Array<string>()
        }

        const list = data.skills.filter((skill) => {
          if (!skill.name || !Array.isArray(skill.files)) {
            log.warn("invalid skill entry", { url: index, skill })
            return false
          }
          return true
        })

        const dirs = yield* Effect.all(
          list.map((skill) =>
            Effect.gen(function* () {
              const root = path.join(cache, skill.name)

              yield* Effect.all(
                skill.files.map((file) => {
                  const link = new URL(file, `${host}/${skill.name}/`).href
                  const dest = path.join(root, file)
                  return get(link, dest)
                }),
                { concurrency: "unbounded" },
              )

              const md = path.join(root, "SKILL.md")
              return (yield* Effect.promise(() => Filesystem.exists(md))) ? root : null
            }),
          ),
          { concurrency: "unbounded" },
        )

        return dirs.filter((dir): dir is string => Boolean(dir))
      })

      return DiscoveryService.of({ pull })
    }),
  )

  static readonly defaultLayer = DiscoveryService.layer.pipe(Layer.provide(FetchHttpClient.layer))
}
