/**
 * Request injection utilities for the fetch wrapper.
 * PRIMARY injection mechanism for forcing Ultrathink prompts into outbound API requests.
 *
 * Strategy:
 * 1. ALWAYS ensure the last user message starts with "Ultrathink" (bulletproof baseline)
 * 2. In tool mode, also inject thinking prompts after tool outputs
 * 3. Use consistent deduplication to avoid double-injection
 */

const ULTRATHINK_KEYWORD = "ultrathink"

function isString(x: unknown): x is string {
  return typeof x === "string"
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x)
}

/**
 * Check if text already contains the Ultrathink keyword (case-insensitive).
 * This must match the logic used in message-transformer.ts for consistency.
 */
function hasUltrathinkPrefix(text: string): boolean {
  return text.trimStart().toLowerCase().startsWith(ULTRATHINK_KEYWORD)
}

/**
 * Inject prefix into a string content, with deduplication.
 */
function injectPrefixIntoString(content: string, prefix: string): string | null {
  if (hasUltrathinkPrefix(content)) return null
  return prefix + "\n\n" + content
}

/**
 * Inject prefix into the first text part of an array content, with deduplication.
 */
function injectPrefixIntoArrayContent(content: unknown[], prefix: string): boolean {
  for (const part of content) {
    if (!isRecord(part) || part.type !== "text") continue
    const text = (part as any).text
    if (!isString(text)) continue

    if (hasUltrathinkPrefix(text))
      return false // Already has prefix
    ;(part as any).text = prefix + "\n\n" + text
    return true
  }
  return false
}

/**
 * BULLETPROOF: Always ensure the last user message starts with Ultrathink.
 * This is the baseline guarantee - even if all other injections fail, this will work.
 */
function ensureLastUserMessageHasPrefix(messages: unknown[], prefix: string): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!isRecord(msg) || msg.role !== "user") continue

    const content = msg.content

    // Handle string content
    if (isString(content)) {
      const injected = injectPrefixIntoString(content, prefix)
      if (injected !== null) {
        msg.content = injected
        return true
      }
      return false // Already has prefix
    }

    // Handle array content (OpenAI multi-part format)
    if (Array.isArray(content)) {
      return injectPrefixIntoArrayContent(content, prefix)
    }
  }
  return false
}

/**
 * Inject thinking prompts after tool/function role messages (OpenAI format).
 */
function injectAfterToolRoleMessages(messages: unknown[], prefix: string): boolean {
  let modified = false

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!isRecord(msg)) continue

    const role = msg.role
    if (role !== "tool" && role !== "function") continue

    // Check if next message is already our injection
    const nextMsg = messages[i + 1]
    if (isRecord(nextMsg) && nextMsg.role === "user") {
      const nextContent = nextMsg.content
      if (isString(nextContent) && hasUltrathinkPrefix(nextContent)) {
        continue // Already injected
      }
    }

    const failed = isToolOutputFailed(msg.content)
    messages.splice(i + 1, 0, {
      role: "user",
      content: buildThinkingPrompt(prefix, failed),
    })
    modified = true
    i++ // Skip the injected message
  }

  return modified
}

/**
 * Inject thinking prompts after tool_result parts in user messages (Anthropic format).
 */
function injectAfterToolResultParts(messages: unknown[], prefix: string): boolean {
  let modified = false

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!isRecord(msg) || msg.role !== "user") continue

    const content = msg.content
    if (!Array.isArray(content)) continue

    const toolResultParts = content.filter((part) => isRecord(part) && part.type === "tool_result")
    if (toolResultParts.length === 0) continue

    // Check if next message is already our injection
    const nextMsg = messages[i + 1]
    if (isRecord(nextMsg) && nextMsg.role === "user") {
      const nextContent = nextMsg.content
      if (isString(nextContent) && hasUltrathinkPrefix(nextContent)) {
        continue // Already injected
      }
    }

    const failed = toolResultParts.some((part) => isToolOutputFailed((part as any).content))
    messages.splice(i + 1, 0, {
      role: "user",
      content: buildThinkingPrompt(prefix, failed),
    })
    modified = true
    i++ // Skip the injected message
  }

  return modified
}

/**
 * Main OpenAI-style injection.
 * Handles both string and array content formats.
 */
export function injectIntoOpenAIMessages(messages: unknown[], prefix: string, toolMode: boolean): boolean {
  if (messages.length === 0) return false

  let modified = false

  // STEP 1: ALWAYS ensure last user message has prefix (bulletproof baseline)
  modified = ensureLastUserMessageHasPrefix(messages, prefix) || modified

  // STEP 2: In tool mode, inject after tool outputs for deeper analysis
  if (toolMode) {
    modified = injectAfterToolRoleMessages(messages, prefix) || modified
  }

  return modified
}

/**
 * Anthropic-style injection.
 * Handles tool_result parts within user messages.
 */
export function injectIntoAnthropicMessages(messages: unknown[], prefix: string, toolMode: boolean): boolean {
  if (messages.length === 0) return false

  let modified = false

  // STEP 1: Inject after tool_result parts
  if (toolMode) {
    modified = injectAfterToolResultParts(messages, prefix) || modified
  }

  // STEP 2: Ensure last user message has prefix (backup for Anthropic format)
  // Only if the last user message has array content (Anthropic-style)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!isRecord(msg) || msg.role !== "user") continue

    if (Array.isArray(msg.content)) {
      modified = injectPrefixIntoArrayContent(msg.content, prefix) || modified
    }
    break
  }

  return modified
}

/**
 * Check if tool output indicates failure.
 */
export function isToolOutputFailed(content: unknown): boolean {
  const failWords = ["error", "failed", "exception", "traceback", "stack", "not found", "permission denied", "enoent"]

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

/**
 * Build the thinking prompt to inject.
 */
export function buildThinkingPrompt(prefix: string, failed: boolean): string {
  if (failed) {
    return `${prefix}\n\nTool output indicates failure. Analyze the error and determine next steps.`
  }
  return `${prefix}\n\nAnalyze the tool output and continue with the task.`
}
