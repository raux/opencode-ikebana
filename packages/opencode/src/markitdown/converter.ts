/**
 * Base converter interfaces following the markitdown design pattern.
 *
 * Each converter implements `accepts()` to determine if it can handle a file,
 * and `convert()` to perform the actual conversion to markdown.
 *
 * Converters are registered with a priority (lower = tried first) and the
 * orchestrator iterates through them in order until one succeeds.
 */

export interface StreamInfo {
  mimetype?: string
  extension?: string
  charset?: string
  filename?: string
  path?: string
  url?: string
}

export interface ConverterResult {
  markdown: string
  title?: string
}

export interface DocumentConverter {
  accepts(data: Uint8Array, info: StreamInfo): boolean
  convert(data: Uint8Array, info: StreamInfo): Promise<ConverterResult>
}

export interface ConverterRegistration {
  converter: DocumentConverter
  priority: number
}

/** Lower priority values are tried first */
export const PRIORITY_SPECIFIC = 0
export const PRIORITY_GENERIC = 10
