/**
 * Response sanitization for provider streaming.
 * Rewrites known malformed model output patterns into structured tool call events.
 */

import { randomUUID } from "crypto"
import { sanitizeOpenAISseEventStream } from "./openai-sse.js"
import { parseToolCallBlock } from "./tool-call-block.js"

type SanitizerOptions = {
  onToolCallRewritten?: (toolName: string) => void
  likelySse?: boolean
}

export async function sanitizeModelResponse(response: Response, options: SanitizerOptions = {}): Promise<Response> {
  const contentType = response.headers.get("content-type") || ""

  if (contentType.includes("text/event-stream") || options.likelySse === true) {
    return sanitizeOpenAISseEventStream(response, options)
  }

  // Some OpenAI-compatible providers return non-streaming JSON for chat completions.
  // Best-effort: keep default behavior unless we can safely rewrite.
  if (contentType.includes("application/json")) {
    return sanitizeOpenAIJsonResponse(response, options)
  }

  return response
}

function sanitizeOpenAIJsonResponse(response: Response, options: SanitizerOptions): Response {
  // NOTE: This is deliberately conservative.
  // We only rewrite if we find a complete <tool_call> block inside assistant content.

  const cloned = response.clone()

  const output = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()

      try {
        const json: any = await cloned.json()

        const rewritten = rewriteChatCompletionsJson(json, options)
        if (!rewritten.changed) {
          // Fallback: return original response bytes
          const originalText = JSON.stringify(json)
          controller.enqueue(encoder.encode(originalText))
          controller.close()
          return
        }

        controller.enqueue(encoder.encode(JSON.stringify(rewritten.value)))
        controller.close()
      } catch {
        // If parsing fails, emit original response body.
        const fallbackText = await response.text().catch(() => "")
        controller.enqueue(encoder.encode(fallbackText))
        controller.close()
      }
    },
  })

  const headers = new Headers(response.headers)
  headers.delete("content-length")

  return new Response(output, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function rewriteChatCompletionsJson(json: any, options: SanitizerOptions): { changed: boolean; value: any } {
  if (!json || !Array.isArray(json.choices)) {
    return { changed: false, value: json }
  }

  let changed = false

  for (const choice of json.choices) {
    const message = choice?.message
    const content = message?.content

    if (!message || typeof content !== "string") continue

    // Check raw content for tool call blocks (preserve thinking tags in content)
    const lower = content.toLowerCase()
    if (lower.includes("<tool_call") && lower.includes("</tool_call>")) {
      const { visibleText, toolCalls } = extractToolCallsFromText(content)
      if (toolCalls.length === 0) continue

      changed = true
      message.content = visibleText
      message.tool_calls = toolCalls.map((tc: any, index: number) => ({
        index,
        id: `call_${randomUUID()}`,
        type: "function",
        function: {
          name: tc.toolName,
          arguments: tc.arguments,
        },
      }))
      choice.finish_reason = "tool_calls"

      for (const tc of toolCalls) {
        options.onToolCallRewritten?.(tc.toolName)
      }
    }
  }

  return { changed, value: json }

  function extractToolCallsFromText(text: string): {
    visibleText: string
    toolCalls: Array<{ toolName: string; arguments: string }>
  } {
    // Preserve thinking tags - only extract tool_call blocks
    let remaining = text

    let visibleText = ""
    const toolCalls: Array<{ toolName: string; arguments: string }> = []

    while (remaining.length > 0) {
      const startIdx = remaining.toLowerCase().indexOf("<tool_call")
      if (startIdx === -1) {
        visibleText += remaining
        break
      }

      visibleText += remaining.slice(0, startIdx)

      const openEnd = remaining.indexOf(">", startIdx)
      if (openEnd === -1) {
        // No complete block.
        visibleText += remaining.slice(startIdx)
        break
      }

      const endTag = "</tool_call>"
      const endIdx = remaining.toLowerCase().indexOf(endTag)
      if (endIdx === -1) {
        visibleText += remaining.slice(startIdx)
        break
      }

      const block = remaining.slice(startIdx, endIdx + endTag.length)
      const parsed = parseToolCallBlock(block)
      if (parsed) toolCalls.push(parsed)

      remaining = remaining.slice(endIdx + endTag.length)
    }

    return { visibleText: visibleText.trimEnd(), toolCalls }
  }
}
