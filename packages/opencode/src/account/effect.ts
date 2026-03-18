import { Clock, Duration, Effect, Layer, Option, Schema, SchemaGetter, ServiceMap } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"

import { withTransientReadRetry } from "@/util/effect-http-client"
import { AccountRepo, type AccountRow } from "./repo"
import {
  type AccountError as SchemaError,
  AccessToken as SchemaAccessToken,
  Account as SchemaAccount,
  AccountID as SchemaAccountID,
  DeviceCode as SchemaDeviceCode,
  RefreshToken as SchemaRefreshToken,
  AccountServiceError as SchemaServiceError,
  Login as SchemaLogin,
  Org as SchemaOrg,
  OrgID as SchemaOrgID,
  PollDenied as SchemaPollDenied,
  PollError as SchemaPollError,
  PollExpired as SchemaPollExpired,
  PollPending as SchemaPollPending,
  type PollResult as SchemaPollResult,
  PollSlow as SchemaPollSlow,
  PollSuccess as SchemaPollSuccess,
  UserCode as SchemaUserCode,
} from "./schema"

export namespace AccountEffect {
  export type Error = SchemaError

  const AccessToken = SchemaAccessToken
  type AccessToken = SchemaAccessToken
  const Account = SchemaAccount
  type Account = SchemaAccount
  const AccountID = SchemaAccountID
  type AccountID = SchemaAccountID
  const DeviceCode = SchemaDeviceCode
  type DeviceCode = SchemaDeviceCode
  const RefreshToken = SchemaRefreshToken
  type RefreshToken = SchemaRefreshToken
  const Login = SchemaLogin
  type Login = SchemaLogin
  const Org = SchemaOrg
  type Org = SchemaOrg
  const OrgID = SchemaOrgID
  type OrgID = SchemaOrgID
  const PollDenied = SchemaPollDenied
  const PollError = SchemaPollError
  const PollExpired = SchemaPollExpired
  const PollPending = SchemaPollPending
  const PollSlow = SchemaPollSlow
  const PollSuccess = SchemaPollSuccess
  const UserCode = SchemaUserCode
  type PollResult = SchemaPollResult

  export type AccountOrgs = {
    account: Account
    orgs: readonly Org[]
  }

  class RemoteConfig extends Schema.Class<RemoteConfig>("RemoteConfig")({
    config: Schema.Record(Schema.String, Schema.Json),
  }) {}

  const DurationFromSeconds = Schema.Number.pipe(
    Schema.decodeTo(Schema.Duration, {
      decode: SchemaGetter.transform((n) => Duration.seconds(n)),
      encode: SchemaGetter.transform((d) => Duration.toSeconds(d)),
    }),
  )

  class TokenRefresh extends Schema.Class<TokenRefresh>("TokenRefresh")({
    access_token: AccessToken,
    refresh_token: RefreshToken,
    expires_in: DurationFromSeconds,
  }) {}

  class DeviceAuth extends Schema.Class<DeviceAuth>("DeviceAuth")({
    device_code: DeviceCode,
    user_code: UserCode,
    verification_uri_complete: Schema.String,
    expires_in: DurationFromSeconds,
    interval: DurationFromSeconds,
  }) {}

  class DeviceTokenSuccess extends Schema.Class<DeviceTokenSuccess>("DeviceTokenSuccess")({
    access_token: AccessToken,
    refresh_token: RefreshToken,
    token_type: Schema.Literal("Bearer"),
    expires_in: DurationFromSeconds,
  }) {}

  class DeviceTokenError extends Schema.Class<DeviceTokenError>("DeviceTokenError")({
    error: Schema.String,
    error_description: Schema.String,
  }) {
    toPollResult(): PollResult {
      if (this.error === "authorization_pending") return new PollPending()
      if (this.error === "slow_down") return new PollSlow()
      if (this.error === "expired_token") return new PollExpired()
      if (this.error === "access_denied") return new PollDenied()
      return new PollError({ cause: this.error })
    }
  }

  const DeviceToken = Schema.Union([DeviceTokenSuccess, DeviceTokenError])

  class User extends Schema.Class<User>("User")({
    id: AccountID,
    email: Schema.String,
  }) {}

  class ClientId extends Schema.Class<ClientId>("ClientId")({ client_id: Schema.String }) {}

  class DeviceTokenRequest extends Schema.Class<DeviceTokenRequest>("DeviceTokenRequest")({
    grant_type: Schema.String,
    device_code: DeviceCode,
    client_id: Schema.String,
  }) {}

  class TokenRefreshRequest extends Schema.Class<TokenRefreshRequest>("TokenRefreshRequest")({
    grant_type: Schema.String,
    refresh_token: RefreshToken,
    client_id: Schema.String,
  }) {}

  const client_id = "opencode-cli"

  const map =
    (message = "Account service operation failed") =>
    <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, SchemaServiceError, R> =>
      effect.pipe(
        Effect.mapError((cause) =>
          cause instanceof SchemaServiceError ? cause : new SchemaServiceError({ message, cause }),
        ),
      )

  export interface Interface {
    readonly active: () => Effect.Effect<Option.Option<Account>, Error>
    readonly list: () => Effect.Effect<Account[], Error>
    readonly orgsByAccount: () => Effect.Effect<readonly AccountOrgs[], Error>
    readonly remove: (accountID: AccountID) => Effect.Effect<void, Error>
    readonly use: (accountID: AccountID, orgID: Option.Option<OrgID>) => Effect.Effect<void, Error>
    readonly orgs: (accountID: AccountID) => Effect.Effect<readonly Org[], Error>
    readonly config: (accountID: AccountID, orgID: OrgID) => Effect.Effect<Option.Option<Record<string, unknown>>, Error>
    readonly token: (accountID: AccountID) => Effect.Effect<Option.Option<AccessToken>, Error>
    readonly login: (url: string) => Effect.Effect<Login, Error>
    readonly poll: (input: Login) => Effect.Effect<PollResult, Error>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Account") {}

  export const layer: Layer.Layer<Service, never, AccountRepo | HttpClient.HttpClient> = Layer.effect(
    Service,
    Effect.gen(function* () {
      const repo = yield* AccountRepo
      const http = yield* HttpClient.HttpClient
      const httpRead = withTransientReadRetry(http)
      const httpOk = HttpClient.filterStatusOk(http)
      const httpReadOk = HttpClient.filterStatusOk(httpRead)

      const executeRead = (request: HttpClientRequest.HttpClientRequest) =>
        httpRead.execute(request).pipe(map("HTTP request failed"))

      const executeReadOk = (request: HttpClientRequest.HttpClientRequest) =>
        httpReadOk.execute(request).pipe(map("HTTP request failed"))

      const executeEffectOk = <E>(request: Effect.Effect<HttpClientRequest.HttpClientRequest, E>) =>
        request.pipe(
          Effect.flatMap((req) => httpOk.execute(req)),
          map("HTTP request failed"),
        )

      const resolveToken = Effect.fnUntraced(function* (row: AccountRow) {
        const now = yield* Clock.currentTimeMillis
        if (row.token_expiry && row.token_expiry > now) return row.access_token

        const response = yield* executeEffectOk(
          HttpClientRequest.post(`${row.url}/auth/device/token`).pipe(
            HttpClientRequest.acceptJson,
            HttpClientRequest.schemaBodyJson(TokenRefreshRequest)(
              new TokenRefreshRequest({
                grant_type: "refresh_token",
                refresh_token: row.refresh_token,
                client_id,
              }),
            ),
          ),
        )

        const parsed = yield* HttpClientResponse.schemaBodyJson(TokenRefresh)(response).pipe(
          map("Failed to decode response"),
        )

        const expiry = Option.some(now + Duration.toMillis(parsed.expires_in))

        yield* repo.persistToken({
          accountID: row.id,
          accessToken: parsed.access_token,
          refreshToken: parsed.refresh_token,
          expiry,
        })

        return parsed.access_token
      })

      const resolveAccess = Effect.fnUntraced(function* (accountID: AccountID) {
        const maybe = yield* repo.getRow(accountID)
        if (Option.isNone(maybe)) return Option.none()

        const account = maybe.value
        const accessToken = yield* resolveToken(account)
        return Option.some({ account, accessToken })
      })

      const fetchOrgs = Effect.fnUntraced(function* (url: string, accessToken: AccessToken) {
        const response = yield* executeReadOk(
          HttpClientRequest.get(`${url}/api/orgs`).pipe(
            HttpClientRequest.acceptJson,
            HttpClientRequest.bearerToken(accessToken),
          ),
        )

        return yield* HttpClientResponse.schemaBodyJson(Schema.Array(Org))(response).pipe(
          map("Failed to decode response"),
        )
      })

      const fetchUser = Effect.fnUntraced(function* (url: string, accessToken: AccessToken) {
        const response = yield* executeReadOk(
          HttpClientRequest.get(`${url}/api/user`).pipe(
            HttpClientRequest.acceptJson,
            HttpClientRequest.bearerToken(accessToken),
          ),
        )

        return yield* HttpClientResponse.schemaBodyJson(User)(response).pipe(map("Failed to decode response"))
      })

      const token = Effect.fn("Account.token")((accountID: AccountID) =>
        resolveAccess(accountID).pipe(Effect.map(Option.map((r) => r.accessToken))),
      )

      const orgs = Effect.fn("Account.orgs")(function* (accountID: AccountID) {
        const resolved = yield* resolveAccess(accountID)
        if (Option.isNone(resolved)) return []

        return yield* fetchOrgs(resolved.value.account.url, resolved.value.accessToken)
      })

      const orgsByAccount = Effect.fn("Account.orgsByAccount")(function* () {
        const accounts = yield* repo.list()
        const [errors, results] = yield* Effect.partition(
          accounts,
          (account) => orgs(account.id).pipe(Effect.map((orgs) => ({ account, orgs }))),
          { concurrency: 3 },
        )
        for (const err of errors) {
          yield* Effect.logWarning("failed to fetch orgs for account").pipe(Effect.annotateLogs({ error: String(err) }))
        }
        return results
      })

      const config = Effect.fn("Account.config")(function* (accountID: AccountID, orgID: OrgID) {
        const resolved = yield* resolveAccess(accountID)
        if (Option.isNone(resolved)) return Option.none()

        const response = yield* executeRead(
          HttpClientRequest.get(`${resolved.value.account.url}/api/config`).pipe(
            HttpClientRequest.acceptJson,
            HttpClientRequest.bearerToken(resolved.value.accessToken),
            HttpClientRequest.setHeaders({ "x-org-id": orgID }),
          ),
        )

        if (response.status === 404) return Option.none()

        const ok = yield* HttpClientResponse.filterStatusOk(response).pipe(map())
        const parsed = yield* HttpClientResponse.schemaBodyJson(RemoteConfig)(ok).pipe(map("Failed to decode response"))
        return Option.some(parsed.config)
      })

      const login = Effect.fn("Account.login")(function* (server: string) {
        const response = yield* executeEffectOk(
          HttpClientRequest.post(`${server}/auth/device/code`).pipe(
            HttpClientRequest.acceptJson,
            HttpClientRequest.schemaBodyJson(ClientId)(new ClientId({ client_id })),
          ),
        )

        const parsed = yield* HttpClientResponse.schemaBodyJson(DeviceAuth)(response).pipe(map("Failed to decode response"))
        return new Login({
          code: parsed.device_code,
          user: parsed.user_code,
          url: `${server}${parsed.verification_uri_complete}`,
          server,
          expiry: parsed.expires_in,
          interval: parsed.interval,
        })
      })

      const poll = Effect.fn("Account.poll")(function* (input: Login) {
        const response = yield* executeEffectOk(
          HttpClientRequest.post(`${input.server}/auth/device/token`).pipe(
            HttpClientRequest.acceptJson,
            HttpClientRequest.schemaBodyJson(DeviceTokenRequest)(
              new DeviceTokenRequest({
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                device_code: input.code,
                client_id,
              }),
            ),
          ),
        )

        const parsed = yield* HttpClientResponse.schemaBodyJson(DeviceToken)(response).pipe(map("Failed to decode response"))
        if (parsed instanceof DeviceTokenError) return parsed.toPollResult()

        const [account, remoteOrgs] = yield* Effect.all(
          [fetchUser(input.server, parsed.access_token), fetchOrgs(input.server, parsed.access_token)],
          { concurrency: 2 },
        )

        const first = remoteOrgs.length > 0 ? Option.some(remoteOrgs[0].id) : Option.none<OrgID>()
        const expiry = (yield* Clock.currentTimeMillis) + Duration.toMillis(parsed.expires_in)

        yield* repo.persistAccount({
          id: account.id,
          email: account.email,
          url: input.server,
          accessToken: parsed.access_token,
          refreshToken: parsed.refresh_token,
          expiry,
          orgID: first,
        })

        return new PollSuccess({ email: account.email })
      })

      return Service.of({
        active: repo.active,
        list: repo.list,
        orgsByAccount,
        remove: repo.remove,
        use: repo.use,
        orgs,
        config,
        token,
        login,
        poll,
      })
    }),
  )

  export const defaultLayer = layer.pipe(Layer.provide(AccountRepo.layer), Layer.provide(FetchHttpClient.layer))
}
