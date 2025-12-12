/**
 * Fetch wrapper implementation from master branch
 * Intercepts API calls to inject thinking prompts before they reach the AI model
 */

import { logToFile } from "./logger.js"
import { TARGET_MODELS, shouldEnhanceModel } from "./model-filter.js"

interface FetchWrapperConfig {
  enabled: boolean
  prefix: string
  mode: "lite" | "tool"
}

export function initializeFetchWrapper(config: FetchWrapperConfig) {

  const originalFetch = globalThis.fetch

  globalThis.fetch = async (input: any, init?: any) => {
    if (!config.enabled || !init?.body || typeof init.body !== 'string') {
      return originalFetch(input, init)
    }

    try {
      const body = JSON.parse(init.body)
      
      // Check if this request is for a target model
      const modelId = body.model || ''
      const shouldEnhance = shouldEnhanceModel(modelId)
      
      if (!shouldEnhance) {
        return originalFetch(input, init)
      }
      
      let modified = false
      const toolMode = config.mode === 'tool'

      // Handle OpenAI Chat Completions format
      if (body.messages && Array.isArray(body.messages)) {
        modified = toolMode
          ? injectIntoOpenAIMessages(body.messages, config.prefix)
          : injectLitePrefix(body.messages, config.prefix)
        logToFile(`🌐 Fetch wrapper: ${modified ? 'MODIFIED' : 'no change'} (${toolMode ? 'tool' : 'lite'} mode)`)
      }

      // Handle Anthropic format
      if (toolMode && body.messages && Array.isArray(body.messages)) {
        const anthropicModified = injectIntoAnthropicMessages(body.messages, config.prefix)
        modified = anthropicModified || modified
        if (anthropicModified) {
          logToFile(`🌐 Fetch wrapper: MODIFIED (Anthropic format)`)
        }
      }

      if (modified) {
        init.body = JSON.stringify(body)
      }
    } catch (error) {
      logToFile(`🌐 Fetch wrapper error: ${error}`, "DEBUG")
      // If parsing fails, continue with original request
    }

    return originalFetch(input, init)
  }

  logToFile(`🌐 Fetch wrapper initialized for models: ${TARGET_MODELS.join(", ")}`)
}

// OpenAI message injection
function injectIntoOpenAIMessages(messages: any[], prefix: string): boolean {
  if (messages.length === 0) return false

  let modified = false

  // Insert a thinking prompt immediately after every tool output.
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    if (msg.role === 'tool' || msg.role === 'function') {
      const failed = isToolOutputFailed(msg.content)
      messages.splice(i + 1, 0, {
        role: 'user',
        content: buildThinkingPrompt(prefix, failed)
      })
      modified = true
      i++
      continue
    }

    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const hasToolResult = msg.content.some((part: any) => part.type === 'tool_result')
      if (hasToolResult) {
        const failed = msg.content.some((part: any) => part.type === 'tool_result' && isToolOutputFailed(part.content))
        messages.splice(i + 1, 0, {
          role: 'user',
          content: buildThinkingPrompt(prefix, failed)
        })
        modified = true
        i++
        continue
      }
    }
  }

  // Preserve original behavior: ensure last user message gets the prefix at least once.
  if (!modified) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          if (!msg.content.startsWith(prefix)) {
            msg.content = prefix + msg.content
            return true
          }
        } else if (Array.isArray(msg.content)) {
          let injected = false
          for (const part of msg.content) {
            if (part.type === 'text' && typeof part.text === 'string') {
              if (!part.text.startsWith(prefix)) {
                part.text = prefix + part.text
                injected = true
              }
            }
          }
          if (injected) return true
        }
      }
    }
  }

  return modified
}

// Lite mode: only ensure latest user message is prefixed
function injectLitePrefix(messages: any[], prefix: string): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        if (!msg.content.startsWith(prefix)) {
          msg.content = prefix + msg.content
          return true
        }
      } else if (Array.isArray(msg.content)) {
        let injected = false
        for (const part of msg.content) {
          if (part.type === 'text' && typeof part.text === 'string') {
            if (!part.text.startsWith(prefix)) {
              part.text = prefix + part.text
              injected = true
            }
          }
        }
        if (injected) return true
      }
    }
  }
  return false
}

// Anthropic message injection
function injectIntoAnthropicMessages(messages: any[], prefix: string): boolean {
  if (messages.length === 0) return false

  let modified = false

  for (const msg of messages) {
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const toolParts = msg.content.filter((part: any) => part.type === 'tool_result')
      if (toolParts.length > 0) {
        const failed = toolParts.some((part: any) => isToolOutputFailed(part.content))
        msg.content.push({
          type: 'text',
          text: "\n\n" + buildThinkingPrompt(prefix, failed)
        })
        modified = true
      }
    }
  }

  if (!modified) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text' && typeof part.text === 'string') {
            if (!part.text.startsWith(prefix)) {
              part.text = prefix + part.text
              return true
            }
          }
        }
      }
    }
  }

  return modified
}

// Failure detection heuristic
function isToolOutputFailed(content: any): boolean {
  const failWords = ["error", "failed", "exception", "traceback", "stack", "not found"]

  const checkString = (text: string): boolean => {
    const lower = text.toLowerCase()
    if (failWords.some(w => lower.includes(w))) return true
    try {
      const parsed = JSON.parse(text)
      return isToolOutputFailed(parsed)
    } catch {
      return false
    }
  }

  if (typeof content === 'string') return checkString(content)

  if (Array.isArray(content)) {
    return content.some(part => {
      if (typeof part === 'string') return checkString(part)
      if (part?.text && typeof part.text === 'string') return checkString(part.text)
      return false
    })
  }

  if (content && typeof content === 'object') {
    const status = (content.status || content.state || content.result || content.error)?.toString().toLowerCase?.()
    if (status && !["completed", "success", "succeeded", "ok", "done"].includes(status)) return true

    return Object.values(content).some((v: any) => {
      if (typeof v === 'string') return checkString(v)
      return false
    })
  }

  return false
}

// Build thinking prompt based on failure status
function buildThinkingPrompt(prefix: string, failed: boolean): string {
  if (failed) {
    return `${prefix}Tool output failed. Consider re-running the tool or re-reading the file before editing it.`
  }
  return `${prefix}Analyze the tool output and continue.`
}