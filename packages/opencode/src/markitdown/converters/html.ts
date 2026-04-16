import TurndownService from "turndown"
import type { DocumentConverter, ConverterResult, StreamInfo } from "../converter"

const MIMES = ["text/html", "application/xhtml+xml"]
const EXTENSIONS = [".html", ".htm", ".xhtml"]

export class HtmlConverter implements DocumentConverter {
  accepts(_data: Uint8Array, info: StreamInfo): boolean {
    if (info.mimetype && MIMES.some((m) => info.mimetype!.startsWith(m))) return true
    if (info.extension && EXTENSIONS.includes(info.extension.toLowerCase())) return true
    return false
  }

  async convert(data: Uint8Array, _info: StreamInfo): Promise<ConverterResult> {
    const html = new TextDecoder().decode(data)
    const service = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
    })
    service.remove(["script", "style", "meta", "link"])

    const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim()
    return {
      markdown: service.turndown(html),
      title,
    }
  }
}
