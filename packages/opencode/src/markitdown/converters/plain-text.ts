import type { DocumentConverter, ConverterResult, StreamInfo } from "../converter"

const MIMES = ["text/plain", "text/"]
const EXTENSIONS = [".txt", ".md", ".markdown", ".rst", ".log", ".cfg", ".ini", ".csv", ".tsv"]

export class PlainTextConverter implements DocumentConverter {
  accepts(_data: Uint8Array, info: StreamInfo): boolean {
    if (info.mimetype && MIMES.some((m) => info.mimetype!.startsWith(m))) return true
    if (info.extension && EXTENSIONS.includes(info.extension.toLowerCase())) return true
    return false
  }

  async convert(data: Uint8Array, _info: StreamInfo): Promise<ConverterResult> {
    return {
      markdown: new TextDecoder().decode(data),
    }
  }
}
