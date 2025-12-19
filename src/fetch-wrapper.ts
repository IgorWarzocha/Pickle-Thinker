/**
 * Fetch wrapper for Ultrathink.
 * Mutates outbound requests in lite mode and sanitizes inbound streaming responses to recover malformed tool calls.
 */

import { logToFile } from "./logger.js"
import { shouldEnhanceModel, logTargetModels } from "./model-filter.js"
import {
  injectIntoAnthropicMessages,
  injectIntoOpenAIMessages,
  injectLitePrefix,
} from "./fetch-wrapper/request-injector.js"
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

    if (injectRequests && parsedBody) {
      try {
        const toolMode = config.mode === "tool"

        if (Array.isArray(parsedBody.messages)) {
          const modified = toolMode
            ? injectIntoOpenAIMessages(parsedBody.messages, config.prefix, toolMode)
            : injectLitePrefix(parsedBody.messages, config.prefix)

          if (modified) {
            init.body = JSON.stringify(parsedBody)
          }
        }

        if (toolMode && Array.isArray(parsedBody.messages)) {
          const modified = injectIntoAnthropicMessages(parsedBody.messages, config.prefix, toolMode)
          if (modified) {
            init.body = JSON.stringify(parsedBody)
          }
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
