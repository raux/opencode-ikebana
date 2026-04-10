/**
 * Registers a global OTel tracer provider so the AI SDK's
 * `experimental_telemetry` spans are exported alongside Effect's own spans.
 *
 * Effect's Otlp.layerJson (in effect/oltp.ts) handles Effect-service tracing
 * but does NOT register a global provider — the AI SDK only talks to the
 * global one. This bridge fills the gap with a lightweight BasicTracerProvider.
 *
 * Import this module as the FIRST import in the entry point so the provider
 * is registered before any AI SDK code runs.
 */
import { Flag } from "@/flag/flag"

const endpoint = Flag.OTEL_EXPORTER_OTLP_ENDPOINT
if (endpoint) {
  const { trace } = await import("@opentelemetry/api")
  const { BasicTracerProvider, BatchSpanProcessor } = await import("@opentelemetry/sdk-trace-base")
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http")
  const { resourceFromAttributes } = await import("@opentelemetry/resources")
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import("@opentelemetry/semantic-conventions")

  const { CHANNEL, VERSION } = await import("@/installation/meta")

  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "opencode",
      [ATTR_SERVICE_VERSION]: VERSION,
      "deployment.environment.name": CHANNEL === "local" ? "local" : CHANNEL,
    }),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: `${endpoint.replace(/\/$/, "")}/v1/traces`,
          headers: Flag.OTEL_EXPORTER_OTLP_HEADERS
            ? Flag.OTEL_EXPORTER_OTLP_HEADERS.split(",").reduce(
                (acc, x) => {
                  const [key, ...rest] = x.split("=")
                  acc[key] = rest.join("=")
                  return acc
                },
                {} as Record<string, string>,
              )
            : undefined,
        }),
      ),
    ],
  })

  trace.setGlobalTracerProvider(provider)

  const shutdown = () => provider.shutdown().catch(() => {})
  process.on("beforeExit", shutdown)
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}
