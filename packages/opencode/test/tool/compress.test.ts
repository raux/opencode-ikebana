import { describe, test, expect } from "bun:test"
import { compress, segment } from "../../src/tool/compress"

describe("compress", () => {
  test("removes articles in full mode", () => {
    const input = "The quick brown fox jumps over a lazy dog"
    const result = compress(input, "full")
    expect(result).not.toContain("The ")
    expect(result).not.toContain(" a ")
    expect(result).toContain("quick brown fox")
    expect(result).toContain("lazy dog")
  })

  test("removes filler words", () => {
    const input = "You should just basically really check the logs"
    const result = compress(input, "full")
    expect(result).not.toContain("just")
    expect(result).not.toContain("basically")
    expect(result).not.toContain("really")
  })

  test("replaces verbose phrases", () => {
    const input = "In order to fix this, you need to restart the server"
    const result = compress(input, "full")
    expect(result).toContain("to fix this")
    expect(result).not.toContain("In order to")
  })

  test("preserves code blocks", () => {
    const input = "Run the following:\n```\nconst a = the + just + really\n```\nThat is the solution."
    const result = compress(input, "full")
    expect(result).toContain("const a = the + just + really")
  })

  test("preserves inline code", () => {
    const input = "Use `the.really.just` function to fix the issue"
    const result = compress(input, "full")
    expect(result).toContain("`the.really.just`")
  })

  test("preserves URLs", () => {
    const input = "Visit https://example.com/the/really/just for the documentation"
    const result = compress(input, "full")
    expect(result).toContain("https://example.com/the/really/just")
  })

  test("preserves file paths", () => {
    const input = "Edit the file at /src/the/really/just.ts for the fix"
    const result = compress(input, "full")
    expect(result).toContain("/src/the/really/just.ts")
  })

  test("lite mode keeps articles", () => {
    const input = "The quick brown fox jumps over a lazy dog"
    const result = compress(input, "lite")
    expect(result).toContain("The")
    expect(result).toContain(" a ")
  })

  test("ultra mode abbreviates technical terms", () => {
    const input = "The database configuration and authentication implementation"
    const result = compress(input, "ultra")
    expect(result).toContain("DB")
    expect(result).toContain("config")
    expect(result).toContain("auth")
    expect(result).toContain("impl")
  })

  test("collapses extra whitespace", () => {
    const input = "Fix   the    really   big   issue"
    const result = compress(input, "full")
    expect(result).not.toMatch(/  /)
  })

  test("handles empty input", () => {
    expect(compress("", "full")).toBe("")
  })

  test("handles input with only protected content", () => {
    const input = "```\ncode block\n```"
    const result = compress(input, "full")
    expect(result).toBe(input)
  })

  test("reduces verbose LLM-style output significantly", () => {
    const input =
      "Sure! I'd be happy to help you with that. The issue you're experiencing is likely caused by the authentication middleware not properly handling the token expiry check. You should make sure to use the correct comparison operator. However, it might be worth noting that the configuration file also needs to be updated in order to support the new authentication flow."
    const result = compress(input, "full")
    // Verbose LLM output with articles, filler, pleasantries, and hedging
    // should be reduced by at least 30% in character count
    expect(result.length).toBeLessThan(input.length * 0.7)
  })
})

describe("segment", () => {
  test("splits text around code blocks", () => {
    const parts = segment("before ```code``` after")
    expect(parts).toHaveLength(3)
    expect(parts[0]).toEqual({ kind: "text", text: "before " })
    expect(parts[1]).toEqual({ kind: "protected", text: "```code```" })
    expect(parts[2]).toEqual({ kind: "text", text: " after" })
  })

  test("handles multiple protected regions", () => {
    const parts = segment("use `foo` and `bar` here")
    expect(parts.filter((p) => p.kind === "protected")).toHaveLength(2)
  })

  test("handles no protected regions", () => {
    const parts = segment("plain text only")
    expect(parts).toHaveLength(1)
    expect(parts[0]).toEqual({ kind: "text", text: "plain text only" })
  })
})
