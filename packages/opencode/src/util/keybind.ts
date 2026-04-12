import { isDeepEqual } from "remeda"
import type { ParsedKey } from "@opentui/core"

export namespace Keybind {
  /**
   * Keybind info derived from OpenTUI's ParsedKey with our custom `leader` field.
   * This ensures type compatibility and catches missing fields at compile time.
   */
  export type Info = Pick<ParsedKey, "name" | "ctrl" | "meta" | "shift" | "super" | "baseCode"> & {
    leader: boolean // our custom field
  }

  function getBaseCodeName(baseCode: number | undefined): string | undefined {
    if (baseCode === undefined || baseCode < 32 || baseCode === 127) {
      return undefined
    }

    try {
      const name = String.fromCodePoint(baseCode)

      if (name.length === 1 && name >= "A" && name <= "Z") {
        return name.toLowerCase()
      }

      return name
    } catch {
      return undefined
    }
  }

  export function match(a: Info | undefined, b: Info): boolean {
    if (!a) return false
    const normalizedA = { ...a, super: a.super ?? false }
    const normalizedB = { ...b, super: b.super ?? false }
    if (isDeepEqual(normalizedA, normalizedB)) {
      return true
    }

    const modifiersA = {
      ctrl: normalizedA.ctrl,
      meta: normalizedA.meta,
      shift: normalizedA.shift,
      super: normalizedA.super,
      leader: normalizedA.leader,
    }
    const modifiersB = {
      ctrl: normalizedB.ctrl,
      meta: normalizedB.meta,
      shift: normalizedB.shift,
      super: normalizedB.super,
      leader: normalizedB.leader,
    }

    if (!isDeepEqual(modifiersA, modifiersB)) {
      return false
    }

    return (
      normalizedA.name === normalizedB.name ||
      getBaseCodeName(normalizedA.baseCode) === normalizedB.name ||
      getBaseCodeName(normalizedB.baseCode) === normalizedA.name
    )
  }

  export function parseOne(key: string): Info {
    const parsed = parse(key)

    if (parsed.length !== 1) {
      throw new Error(`Expected exactly one keybind, got ${parsed.length}: ${key}`)
    }

    return parsed[0]!
  }

  /**
   * Convert OpenTUI's ParsedKey to our Keybind.Info format.
   * This helper ensures all required fields are present and avoids manual object creation.
   */
  export function fromParsedKey(key: ParsedKey, leader = false): Info {
    return {
      name: key.name === " " ? "space" : key.name,
      ctrl: key.ctrl,
      meta: key.meta,
      shift: key.shift,
      super: key.super ?? false,
      baseCode: key.baseCode,
      leader,
    }
  }

  export function matchParsedKey(binding: Info | string | undefined, key: ParsedKey, leader = false): boolean {
    const bindings = typeof binding === "string" ? parse(binding) : binding ? [binding] : []

    if (!bindings.length) {
      return false
    }

    const parsed = fromParsedKey(key, leader)

    return bindings.some((item) => match(item, parsed))
  }

  export function toString(info: Info | undefined): string {
    if (!info) return ""
    const parts: string[] = []

    if (info.ctrl) parts.push("ctrl")
    if (info.meta) parts.push("alt")
    if (info.super) parts.push("super")
    if (info.shift) parts.push("shift")
    if (info.name) {
      if (info.name === "delete") parts.push("del")
      else parts.push(info.name)
    }

    let result = parts.join("+")

    if (info.leader) {
      result = result ? `<leader> ${result}` : `<leader>`
    }

    return result
  }

  export function parse(key: string): Info[] {
    if (key === "none") return []

    return key.split(",").map((combo) => {
      // Handle <leader> syntax by replacing with leader+
      const normalized = combo.replace(/<leader>/g, "leader+")
      const parts = normalized.toLowerCase().split("+")
      const info: Info = {
        ctrl: false,
        meta: false,
        shift: false,
        leader: false,
        name: "",
      }

      for (const part of parts) {
        switch (part) {
          case "ctrl":
            info.ctrl = true
            break
          case "alt":
          case "meta":
          case "option":
            info.meta = true
            break
          case "super":
            info.super = true
            break
          case "shift":
            info.shift = true
            break
          case "leader":
            info.leader = true
            break
          case "esc":
            info.name = "escape"
            break
          default:
            info.name = part
            break
        }
      }

      return info
    })
  }
}
