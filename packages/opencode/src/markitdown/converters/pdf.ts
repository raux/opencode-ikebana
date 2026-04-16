import type { DocumentConverter, ConverterResult, StreamInfo } from "../converter"

const MIMES = ["application/pdf", "application/x-pdf"]
const EXTENSIONS = [".pdf"]

export class PdfConverter implements DocumentConverter {
  accepts(_data: Uint8Array, info: StreamInfo): boolean {
    if (info.mimetype && MIMES.some((m) => info.mimetype!.startsWith(m))) return true
    if (info.extension && EXTENSIONS.includes(info.extension.toLowerCase())) return true
    return false
  }

  async convert(data: Uint8Array, _info: StreamInfo): Promise<ConverterResult> {
    const { extractText, getDocumentProxy } = await import("unpdf")
    const pdf = await getDocumentProxy(new Uint8Array(data))
    const result = await extractText(pdf, { mergePages: false })
    const pages: string[] = Array.isArray(result.text) ? result.text : [result.text]

    const parts: string[] = []
    for (let i = 0; i < pages.length; i++) {
      const content = (pages[i] ?? "").trim()
      if (!content) continue
      parts.push(`<!-- Page ${i + 1} of ${result.totalPages} -->\n\n${content}`)
    }

    return {
      markdown: parts.join("\n\n---\n\n"),
      title: `PDF Document (${result.totalPages} pages)`,
    }
  }
}
