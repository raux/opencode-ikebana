import { describe, expect, test, spyOn } from "bun:test"
import { Bus } from "../../src/bus"
import { Instance } from "../../src/project/instance"
import type { Provider } from "../../src/provider/provider"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { Session } from "../../src/session"
import { LLM } from "../../src/session/llm"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionProcessor } from "../../src/session/processor"
import { MessageID } from "../../src/session/schema"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

const model: Provider.Model = {
  id: ModelID.make("gpt-5.4"),
  providerID: ProviderID.make("openai"),
  api: {
    id: "openai",
    url: "https://api.openai.com/v1",
    npm: "@ai-sdk/openai",
  },
  name: "GPT-5.4",
  capabilities: {
    temperature: true,
    reasoning: true,
    attachment: false,
    toolcall: false,
    input: {
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    },
    output: {
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    },
    interleaved: false,
  },
  cost: {
    input: 0,
    output: 0,
    cache: { read: 0, write: 0 },
  },
  limit: {
    context: 128_000,
    output: 8_000,
  },
  status: "active",
  options: {},
  headers: {},
  release_date: "2026-01-01",
}

describe("interrupted streamed text reproducers", () => {
  test("persists streamed assistant text on abort so reconnect sees the same partial reply", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({ title: "manual" })
        const user = await Session.updateMessage({
          id: MessageID.ascending(),
          role: "user",
          sessionID: session.id,
          agent: "build",
          model: {
            providerID: model.providerID,
            modelID: model.id,
          },
          time: {
            created: Date.now(),
          },
        })
        const assistant: MessageV2.Assistant = {
          id: MessageID.ascending(),
          role: "assistant",
          sessionID: session.id,
          parentID: user.id,
          providerID: model.providerID,
          modelID: model.id,
          mode: "build",
          agent: "build",
          path: {
            cwd: tmp.path,
            root: tmp.path,
          },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          time: {
            created: Date.now(),
          },
        }
        await Session.updateMessage(assistant)

        const seen = Promise.withResolvers<void>()
        let live = ""
        const off = Bus.subscribe(MessageV2.Event.PartDelta, (evt) => {
          if (evt.properties.messageID !== assistant.id) return
          if (evt.properties.field !== "text") return
          live += evt.properties.delta
          seen.resolve()
        })

        const mock = spyOn(LLM, "stream").mockImplementation(async (input) => {
          return {
            fullStream: (async function* () {
              yield { type: "start" }
              yield { type: "text-start" }
              yield { type: "text-delta", text: "Here is a long one:" }
              await new Promise((resolve) => input.abort.addEventListener("abort", resolve, { once: true }))
              throw new DOMException("Aborted", "AbortError")
            })(),
          } as never
        })

        const abort = new AbortController()
        const proc = SessionProcessor.create({
          assistantMessage: assistant,
          sessionID: session.id,
          model,
          abort: abort.signal,
        })
        const run = proc.process({} as never)

        await seen.promise
        abort.abort()

        expect(await run).toBe("stop")

        const msg = await MessageV2.get({
          sessionID: session.id,
          messageID: assistant.id,
        })
        const text = msg.parts.find((part) => part.type === "text")

        expect(live).toBe("Here is a long one:")
        expect(text?.type).toBe("text")
        expect(text && text.type === "text" ? text.text : undefined).toBe(live)
        expect(msg.info.role === "assistant" ? msg.info.time.completed : undefined).toBeDefined()

        off()
        mock.mockRestore()
        await Session.remove(session.id)
      },
    })
  })
})
