/**
 * Request injection utilities for the fetch wrapper.
 * This mutates outbound API request bodies (lite mode only) to add Ultrathink prompts.
 */

function isString(x: unknown): x is string {
  return typeof x === "string"
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x)
}

export function injectIntoOpenAIMessages(messages: unknown[], prefix: string, toolMode: boolean): boolean {
  if (messages.length === 0) return false

  let modified = false

  // Insert a thinking prompt immediately after every tool output.
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!isRecord(msg)) continue

    const role = msg.role

    if (role === "tool" || role === "function") {
      const failed = isToolOutputFailed(msg.content)
      messages.splice(i + 1, 0, {
        role: "user",
        content: buildThinkingPrompt(prefix, failed),
      })
      modified = true
      i++
      continue
    }

    const content = msg.content
    if (role === "user" && Array.isArray(content)) {
      const hasToolResult = content.some((part) => isRecord(part) && part.type === "tool_result")
      if (hasToolResult) {
        const failed = content.some(
          (part) => isRecord(part) && part.type === "tool_result" && isToolOutputFailed((part as any).content),
        )
        messages.splice(i + 1, 0, {
          role: "user",
          content: buildThinkingPrompt(prefix, failed),
        })
        modified = true
        i++
        continue
      }
    }
  }

  if (!toolMode) {
    return modified
  }

  // Preserve original behavior: ensure last user message gets the prefix at least once.
  if (!modified) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (!isRecord(msg) || msg.role !== "user") continue

      const content = msg.content
      if (isString(content)) {
        if (!content.startsWith(prefix)) {
          msg.content = prefix + content
          return true
        }
        continue
      }

      if (Array.isArray(content)) {
        let injected = false
        for (const part of content) {
          if (!isRecord(part)) continue
          if (part.type === "text" && isString((part as any).text)) {
            const text = (part as any).text as string
            if (!text.startsWith(prefix)) {
              ;(part as any).text = prefix + text
              injected = true
            }
          }
        }
        if (injected) return true
      }
    }
  }

  return modified
}

export function injectLitePrefix(messages: unknown[], prefix: string): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!isRecord(msg) || msg.role !== "user") continue

    const content = msg.content
    if (isString(content)) {
      if (!content.startsWith(prefix)) {
        msg.content = prefix + content
        return true
      }
      continue
    }

    if (Array.isArray(content)) {
      let injected = false
      for (const part of content) {
        if (!isRecord(part)) continue
        if (part.type === "text" && isString((part as any).text)) {
          const text = (part as any).text as string
          if (!text.startsWith(prefix)) {
            ;(part as any).text = prefix + text
            injected = true
          }
        }
      }
      if (injected) return true
    }
  }

  return false
}

export function injectIntoAnthropicMessages(messages: unknown[], prefix: string, toolMode: boolean): boolean {
  if (messages.length === 0) return false

  let modified = false

  for (const msg of messages) {
    if (!isRecord(msg)) continue
    if (msg.role !== "user" || !Array.isArray(msg.content)) continue

    const toolParts = msg.content.filter((part) => isRecord(part) && part.type === "tool_result")
    if (toolParts.length === 0) continue

    const failed = toolParts.some((part) => isToolOutputFailed((part as any).content))
    ;(msg.content as any[]).push({
      type: "text",
      text: "\n\n" + buildThinkingPrompt(prefix, failed),
    })
    modified = true
  }

  if (!toolMode) {
    return modified
  }

  if (!modified) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (!isRecord(msg) || msg.role !== "user" || !Array.isArray(msg.content)) continue

      for (const part of msg.content) {
        if (!isRecord(part)) continue
        if (part.type === "text" && isString((part as any).text)) {
          const text = (part as any).text as string
          if (!text.startsWith(prefix)) {
            ;(part as any).text = prefix + text
            return true
          }
        }
      }
    }
  }

  return modified
}

export function isToolOutputFailed(content: unknown): boolean {
  const failWords = ["error", "failed", "exception", "traceback", "stack", "not found"]

  const checkString = (text: string): boolean => {
    const lower = text.toLowerCase()
    if (failWords.some((w) => lower.includes(w))) return true
    try {
      const parsed = JSON.parse(text)
      return isToolOutputFailed(parsed)
    } catch {
      return false
    }
  }

  if (typeof content === "string") return checkString(content)

  if (Array.isArray(content)) {
    return content.some((part) => {
      if (typeof part === "string") return checkString(part)
      if (isRecord(part) && isString((part as any).text)) return checkString((part as any).text)
      return false
    })
  }

  if (isRecord(content)) {
    const status = (content.status || content.state || content.result || content.error)?.toString?.().toLowerCase?.()
    if (status && !["completed", "success", "succeeded", "ok", "done"].includes(status)) return true

    return Object.values(content).some((v) => (typeof v === "string" ? checkString(v) : false))
  }

  return false
}

export function buildThinkingPrompt(prefix: string, failed: boolean): string {
  if (failed) {
    return `${prefix}Tool output failed. Consider re-running the tool or re-reading the file before editing it.`
  }
  return `${prefix}Analyze the tool output and continue.`
}
