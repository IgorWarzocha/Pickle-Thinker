/**
 * Fetch wrapper for Ultrathink.
 * PRIMARY injection mechanism - intercepts all outbound requests to target models.
 * Also sanitizes inbound streaming responses to recover malformed tool calls.
 */

import { logToFile } from "./logger.js"
import { shouldEnhanceModel, logTargetModels } from "./model-filter.js"
import { injectIntoOpenAIMessages, injectIntoAnthropicMessages } from "./fetch-wrapper/request-injector.js"
import { sanitizeModelResponse } from "./fetch-wrapper/response-sanitizer.js"
import type { FetchWrapperConfig, FetchWrapperOptions } from "./fetch-wrapper/types.js"

export type { FetchWrapperConfig, FetchWrapperOptions }

export function initializeFetchWrapper(config: FetchWrapperConfig, options: FetchWrapperOptions = {}) {
  const originalFetch = globalThis.fetch

  globalThis.fetch = async (input: any, init?: any) => {
    if (!config.enabled || !init?.body || typeof init.body !== "string") {
      return originalFetch(input, init)
    }

    const parsedBody = parseJson(init.body)
    const modelId = typeof parsedBody?.model === "string" ? parsedBody.model : ""

    if (!shouldEnhanceModel(modelId, config.targetModels ?? [])) {
      return originalFetch(input, init)
    }

    const injectRequests = options.injectRequests === true
    const sanitizeResponses = options.sanitizeResponses === true

    if (injectRequests && parsedBody && Array.isArray(parsedBody.messages)) {
      try {
        const toolMode = config.mode === "tool"
        let modified = false

        // Try OpenAI-style injection (handles both string and array content)
        modified = injectIntoOpenAIMessages(parsedBody.messages, config.prefix, toolMode) || modified

        // Also try Anthropic-style injection (handles tool_result parts)
        // Both can run - they handle different message formats
        modified = injectIntoAnthropicMessages(parsedBody.messages, config.prefix, toolMode) || modified

        if (modified) {
          init.body = JSON.stringify(parsedBody)
          logToFile(`💉 Fetch wrapper injected Ultrathink into request for model: ${modelId}`, "DEBUG")
        }
      } catch (error) {
        logToFile(`🌐 Fetch wrapper request injection error: ${error}`, "DEBUG")
      }
    }

    const response = await originalFetch(input, init)

    if (!sanitizeResponses) {
      return response
    }

    try {
      const likelySse = parsedBody?.stream === true
      return await sanitizeModelResponse(response, {
        likelySse,
        onToolCallRewritten(toolName) {
          logToFile(`🧽 Sanitized malformed <tool_call> into function_call: ${toolName}`)
        },
      })
    } catch (error) {
      logToFile(`🌐 Fetch wrapper response sanitize error: ${error}`, "DEBUG")
      return response
    }
  }

  logToFile(`🌐 Fetch wrapper initialized`, "DEBUG")
  logTargetModels(config.targetModels ?? [])
}

function parseJson(raw: string): any | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
