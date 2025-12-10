/**
 * Ultrathink Plugin - Injects "Ultrathink: " before user prompts
 */

import type { Plugin } from "@opencode-ai/plugin"
import { getConfig } from "./config.js"

interface UltrathinkConfig {
  enabled: boolean
  prefix: string
}

export const implementation: Plugin = async (ctx) => {
  const config = getConfig(ctx)

  // Target models that should receive the ultrathink prefix
  const targetModels = [
    "glm-4.6",
    "big-pickle"
  ]

  const originalFetch = globalThis.fetch

  // Install fetch wrapper to intercept API calls
  globalThis.fetch = async (input: any, init?: any) => {
    if (!config.enabled || !init?.body || typeof init.body !== 'string') {
      return originalFetch(input, init)
    }

    try {
      const body = JSON.parse(init.body)
      
      

      
      // Check if this request is for a target model
      const modelId = body.model || ''
      const shouldEnhance = targetModels.some(target => modelId.includes(target))
      
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
      }

      // Handle Anthropic format
      if (toolMode && body.messages && Array.isArray(body.messages)) {
        modified = injectIntoAnthropicMessages(body.messages, config.prefix) || modified
      }

      if (modified) {
        init.body = JSON.stringify(body)
      }
    } catch (error) {
      // If parsing fails, continue with original request
    }

    return originalFetch(input, init)
  }

  return {
    // Plugin initialized successfully
  }
}

function injectIntoOpenAIMessages(messages: any[], prefix: string): boolean {
  if (messages.length === 0) return false

  let modified = false

  // Insert a thinking prompt immediately after every tool output.
  // NOTE: Heuristic failure detection; disable/change if it misfires.
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
        // If multiple tool_result parts exist, insert one consolidated prompt after the message.
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

// Heuristic: try to guess whether a tool output represents a failure.
// Safe to remove/disable if noisy.
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

    // Inspect stringified fields
    return Object.values(content).some((v: any) => {
      if (typeof v === 'string') return checkString(v)
      return false
    })
  }

  return false
}

function buildThinkingPrompt(prefix: string, failed: boolean): string {
  if (failed) {
    return `${prefix}Tool output failed. Consider re-running the tool or re-reading the file before editing it.`
  }
  return `${prefix}Analyze the tool output and continue.`
}
