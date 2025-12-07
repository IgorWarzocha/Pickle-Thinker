/**
 * Ultrathink Plugin - Injects "Ultrathink: " before user prompts
 */

import type { Plugin } from "@opencode-ai/plugin"

interface UltrathinkConfig {
  enabled: boolean
  prefix: string
}

export const implementation: Plugin = async ({ project, client, $, directory, worktree }) => {
  const config: UltrathinkConfig = {
    enabled: true,
    prefix: "Ultrathink: "
  }

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

      // Handle OpenAI Chat Completions format
      if (body.messages && Array.isArray(body.messages)) {
        modified = injectIntoOpenAIMessages(body.messages, config.prefix)
      }

      // Handle Anthropic format
      if (body.messages && Array.isArray(body.messages)) {
        modified = injectIntoAnthropicMessages(body.messages, config.prefix) || modified
      }

      // Handle Gemini format
      if (body.contents && Array.isArray(body.contents)) {
        modified = injectIntoGeminiContents(body.contents, config.prefix)
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
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        if (!msg.content.startsWith(prefix)) {
          msg.content = prefix + msg.content
          return true
        }
      } else if (Array.isArray(msg.content)) {
        let modified = false
        for (const part of msg.content) {
          if (part.type === 'text' && typeof part.text === 'string') {
            if (!part.text.startsWith(prefix)) {
              part.text = prefix + part.text
              modified = true
            }
          }
        }
        return modified
      }
    }
  }
  return false
}

function injectIntoAnthropicMessages(messages: any[], prefix: string): boolean {
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
  return false
}

function injectIntoGeminiContents(contents: any[], prefix: string): boolean {
  for (let i = contents.length - 1; i >= 0; i--) {
    const content = contents[i]
    if (content.role === 'user' && Array.isArray(content.parts)) {
      for (const part of content.parts) {
        if (part.text && typeof part.text === 'string') {
          if (!part.text.startsWith(prefix)) {
            part.text = prefix + part.text
            return true
          }
        }
      }
    }
  }
  return false
}