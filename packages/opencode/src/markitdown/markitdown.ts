import type {
  ConverterRegistration,
  ConverterResult,
  DocumentConverter,
  StreamInfo,
} from "./converter"
import { PRIORITY_GENERIC, PRIORITY_SPECIFIC } from "./converter"
import { PdfConverter } from "./converters/pdf"
import { HtmlConverter } from "./converters/html"
import { PlainTextConverter } from "./converters/plain-text"

export class MarkItDown {
  private converters: ConverterRegistration[] = []

  constructor(opts?: { builtins?: boolean }) {
    if (opts?.builtins !== false) this.builtins()
  }

  builtins() {
    this.register(new PlainTextConverter(), PRIORITY_GENERIC)
    this.register(new HtmlConverter(), PRIORITY_GENERIC)
    this.register(new PdfConverter(), PRIORITY_SPECIFIC)
  }

  register(converter: DocumentConverter, priority = PRIORITY_SPECIFIC) {
    this.converters.push({ converter, priority })
  }

  async convert(data: Uint8Array, info: StreamInfo): Promise<ConverterResult> {
    const sorted = [...this.converters].sort((a, b) => a.priority - b.priority)

    const errors: Error[] = []
    for (const reg of sorted) {
      if (!reg.converter.accepts(data, info)) continue
      try {
        return await reg.converter.convert(data, info)
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)))
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `All matching converters failed:\n${errors.map((e) => e.message).join("\n")}`,
      )
    }
    throw new Error(
      `No converter found for: ${info.mimetype ?? info.extension ?? info.filename ?? "unknown"}`,
    )
  }
}
