/**
 * Request injection utilities for the fetch wrapper.
 * PRIMARY injection mechanism for forcing Ultrathink prompts into outbound API requests.
 *
 * Strategy:
 * 1. ALWAYS ensure the last user message starts with "Ultrathink" instruction
 * 2. In tool mode, also inject thinking prompts after tool outputs
 * 3. Use consistent deduplication to avoid double-injection
 */

const ULTRATHINK_KEYWORD = "ultrathink"

/**
 * The instruction injected before user messages.
 * This is an explicit command, not just a keyword trigger.
 */
const ULTRATHINK_INSTRUCTION = `Ultrathink before responding. You MUST begin your response with deep thinking about the task.`

/**
 * The instruction injected after tool outputs.
 */
function getAfterToolInstruction(failed: boolean): string {
  if (failed) {
    return `Ultrathink about this error. Analyze what went wrong and how to fix it before taking any action.`
  }
  return `Ultrathink about these results. Analyze the output and plan your next steps before taking any action.`
}

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
 * Inject instruction into a string content, with deduplication.
 */
function injectInstructionIntoString(content: string): string | null {
  if (hasUltrathinkPrefix(content)) return null
  return ULTRATHINK_INSTRUCTION + "\n\n" + content
}

/**
 * Inject instruction into the first text part of an array content, with deduplication.
 */
function injectInstructionIntoArrayContent(content: unknown[]): boolean {
  for (const part of content) {
    if (!isRecord(part) || part.type !== "text") continue
    const text = (part as any).text
    if (!isString(text)) continue

    if (hasUltrathinkPrefix(text))
      return false // Already has prefix
    ;(part as any).text = ULTRATHINK_INSTRUCTION + "\n\n" + text
    return true
  }
  return false
}

/**
 * BULLETPROOF: Always ensure the last user message starts with Ultrathink instruction.
 * This is the baseline guarantee - even if all other injections fail, this will work.
 */
function ensureLastUserMessageHasInstruction(messages: unknown[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!isRecord(msg) || msg.role !== "user") continue

    const content = msg.content

    // Handle string content
    if (isString(content)) {
      const injected = injectInstructionIntoString(content)
      if (injected !== null) {
        msg.content = injected
        return true
      }
      return false // Already has prefix
    }

    // Handle array content (OpenAI multi-part format)
    if (Array.isArray(content)) {
      return injectInstructionIntoArrayContent(content)
    }
  }
  return false
}

/**
 * Inject thinking prompts after tool/function role messages (OpenAI format).
 */
function injectAfterToolRoleMessages(messages: unknown[]): boolean {
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
      content: getAfterToolInstruction(failed),
    })
    modified = true
    i++ // Skip the injected message
  }

  return modified
}

/**
 * Inject thinking prompts after tool_result parts in user messages (Anthropic format).
 */
function injectAfterToolResultParts(messages: unknown[]): boolean {
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
      content: getAfterToolInstruction(failed),
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
export function injectIntoOpenAIMessages(messages: unknown[], _prefix: string, toolMode: boolean): boolean {
  if (messages.length === 0) return false

  let modified = false

  // STEP 1: ALWAYS ensure last user message has instruction (bulletproof baseline)
  modified = ensureLastUserMessageHasInstruction(messages) || modified

  // STEP 2: In tool mode, inject after tool outputs for deeper analysis
  if (toolMode) {
    modified = injectAfterToolRoleMessages(messages) || modified
  }

  return modified
}

/**
 * Anthropic-style injection.
 * Handles tool_result parts within user messages.
 */
export function injectIntoAnthropicMessages(messages: unknown[], _prefix: string, toolMode: boolean): boolean {
  if (messages.length === 0) return false

  let modified = false

  // STEP 1: Inject after tool_result parts
  if (toolMode) {
    modified = injectAfterToolResultParts(messages) || modified
  }

  // STEP 2: Ensure last user message has instruction (backup for Anthropic format)
  // Only if the last user message has array content (Anthropic-style)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!isRecord(msg) || msg.role !== "user") continue

    if (Array.isArray(msg.content)) {
      modified = injectInstructionIntoArrayContent(msg.content) || modified
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
