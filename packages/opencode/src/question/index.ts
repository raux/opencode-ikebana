import { runPromiseInstance } from "@/effect/runtime"
import * as S from "./effect"
import type { QuestionID } from "./schema"
import type { SessionID, MessageID } from "@/session/schema"

export namespace Question {
  export const Option = S.QuestionEffect.Option
  export type Option = S.QuestionEffect.Option
  export const Info = S.QuestionEffect.Info
  export type Info = S.QuestionEffect.Info
  export const Request = S.QuestionEffect.Request
  export type Request = S.QuestionEffect.Request
  export const Answer = S.QuestionEffect.Answer
  export type Answer = S.QuestionEffect.Answer
  export const Reply = S.QuestionEffect.Reply
  export type Reply = S.QuestionEffect.Reply
  export const Event = S.QuestionEffect.Event
  export const RejectedError = S.QuestionEffect.RejectedError

  export async function ask(input: {
    sessionID: SessionID
    questions: Info[]
    tool?: { messageID: MessageID; callID: string }
  }): Promise<Answer[]> {
    return runPromiseInstance(S.QuestionEffect.Service.use((service) => service.ask(input)))
  }

  export async function reply(input: { requestID: QuestionID; answers: Answer[] }): Promise<void> {
    return runPromiseInstance(S.QuestionEffect.Service.use((service) => service.reply(input)))
  }

  export async function reject(requestID: QuestionID): Promise<void> {
    return runPromiseInstance(S.QuestionEffect.Service.use((service) => service.reject(requestID)))
  }

  export async function list(): Promise<Request[]> {
    return runPromiseInstance(S.QuestionEffect.Service.use((service) => service.list()))
  }
}
