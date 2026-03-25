export * from "./gen/types.gen.js"

import { createClient } from "./gen/client/client.gen.js"
import { type Config } from "./gen/client/types.gen.js"
import { OpencodeClient } from "./gen/sdk.gen.js"
export { type Config as OpencodeClientConfig, OpencodeClient }

const keys = [
  ["x-opencode-directory", "directory"],
  ["x-opencode-workspace", "workspace"],
] as const

function move(req: Request) {
  if (req.method !== "GET" && req.method !== "HEAD") return req

  let url: URL | undefined

  for (const [header, key] of keys) {
    const value = req.headers.get(header)
    if (!value) continue
    url ??= new URL(req.url)
    if (!url.searchParams.has(key)) url.searchParams.set(key, value)
  }

  if (!url) return req
  const next = new Request(url, req)
  for (const [header] of keys) {
    next.headers.delete(header)
  }
  return next
}

export function createOpencodeClient(config?: Config & { directory?: string; experimental_workspaceID?: string }) {
  if (!config?.fetch) {
    const customFetch: any = (req: any) => {
      // @ts-ignore
      req.timeout = false
      return fetch(req)
    }
    config = {
      ...config,
      fetch: customFetch,
    }
  }

  if (config?.directory) {
    const isNonASCII = /[^\x00-\x7F]/.test(config.directory)
    const encodedDirectory = isNonASCII ? encodeURIComponent(config.directory) : config.directory
    config.headers = {
      ...config.headers,
      "x-opencode-directory": encodedDirectory,
    }
  }

  if (config?.experimental_workspaceID) {
    config.headers = {
      ...config.headers,
      "x-opencode-workspace": config.experimental_workspaceID,
    }
  }

  const client = createClient(config)
  if (typeof window === "object" && typeof document === "object") {
    client.interceptors.request.use(move)
  }
  return new OpencodeClient({ client })
}
