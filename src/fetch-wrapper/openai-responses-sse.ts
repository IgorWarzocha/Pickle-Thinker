/**
 * OpenAI Responses SSE sanitization.
 * Rewrites malformed text-emitted <tool_call> blocks into proper function_call SSE events.
 */

import { randomUUID } from "crypto"
import { parseToolCallBlock } from "./tool-call-block.js"

type RewriterOptions = {
  onToolCallRewritten?: (toolName: string) => void
}

export function sanitizeOpenAIResponsesEventStream(response: Response, options: RewriterOptions = {}): Response {
  const body = response.body
  if (!body) return response

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  let buffer = ""
  let maxOutputIndex = -1

  let inToolCall = false
  let toolCallBuffer = ""

  const output = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true })

        while (true) {
          const boundary = buffer.indexOf("\n\n")
          if (boundary === -1) break

          const eventBlock = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)

          const rewritten = rewriteEventBlock(eventBlock)
          controller.enqueue(encoder.encode(rewritten))
        }
      },
      flush(controller) {
        const tail = buffer + decoder.decode()
        if (tail.length > 0) controller.enqueue(encoder.encode(tail))
      },
    }),
  )

  const headers = new Headers(response.headers)
  headers.delete("content-length")

  return new Response(output, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })

  function rewriteEventBlock(eventBlock: string): string {
    const lines = eventBlock.split("\n")
    const dataLines = lines.filter((l) => l.startsWith("data:"))

    // Not an SSE data block: passthrough.
    if (dataLines.length === 0) {
      return eventBlock + "\n\n"
    }

    const data = dataLines
      .map((l) => l.slice("data:".length).trimStart())
      .join("\n")
      .trim()

    if (data === "[DONE]") {
      return "data: [DONE]\n\n"
    }

    let json: any
    try {
      json = JSON.parse(data)
    } catch {
      return eventBlock + "\n\n"
    }

    if (typeof json?.output_index === "number") {
      maxOutputIndex = Math.max(maxOutputIndex, json.output_index)
    }

    const outChunks = rewriteChunk(json)
    return outChunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("")
  }

  function rewriteChunk(chunk: any): any[] {
    if (chunk?.type !== "response.output_text.delta" || typeof chunk?.delta !== "string") {
      return [chunk]
    }

    const injected: any[] = []
    const { visibleText, toolCalls } = extractVisibleTextAndToolCalls(chunk.delta)

    for (const toolCall of toolCalls) {
      const outputIndex = Math.max(maxOutputIndex + 1, 0)
      maxOutputIndex = outputIndex

      const itemId = randomUUID()
      const callId = randomUUID()

      injected.push({
        type: "response.output_item.added",
        output_index: outputIndex,
        item: {
          type: "function_call",
          id: itemId,
          call_id: callId,
          name: toolCall.toolName,
          arguments: "",
        },
      })

      injected.push({
        type: "response.function_call_arguments.delta",
        item_id: itemId,
        output_index: outputIndex,
        delta: toolCall.arguments,
      })

      injected.push({
        type: "response.output_item.done",
        output_index: outputIndex,
        item: {
          type: "function_call",
          id: itemId,
          call_id: callId,
          name: toolCall.toolName,
          arguments: toolCall.arguments,
          status: "completed",
        },
      })

      options.onToolCallRewritten?.(toolCall.toolName)
    }

    return [{ ...chunk, delta: visibleText }, ...injected]
  }

  function extractVisibleTextAndToolCalls(delta: string): {
    visibleText: string
    toolCalls: Array<{ toolName: string; arguments: string }>
  } {
    // Strip thinking wrappers; these should never be visible output.
    let remaining = delta.replace(/<\/?think>\s*/gi, "").replace(/\[\/?think\]\s*/gi, "")

    let visibleText = ""
    const toolCalls: Array<{ toolName: string; arguments: string }> = []

    while (remaining.length > 0) {
      if (!inToolCall) {
        const startIdx = remaining.toLowerCase().indexOf("<tool_call")
        if (startIdx === -1) {
          visibleText += remaining
          break
        }

        visibleText += remaining.slice(0, startIdx)

        const openEnd = remaining.indexOf(">", startIdx)
        if (openEnd === -1) {
          inToolCall = true
          toolCallBuffer += remaining.slice(startIdx)
          break
        }

        inToolCall = true
        toolCallBuffer += remaining.slice(startIdx, openEnd + 1)
        remaining = remaining.slice(openEnd + 1)
        continue
      }

      const endTag = "</tool_call>"
      const endIdx = remaining.toLowerCase().indexOf(endTag)
      if (endIdx === -1) {
        toolCallBuffer += remaining
        break
      }

      toolCallBuffer += remaining.slice(0, endIdx + endTag.length)
      remaining = remaining.slice(endIdx + endTag.length)
      inToolCall = false

      const parsed = parseToolCallBlock(toolCallBuffer)
      toolCallBuffer = ""
      if (parsed) toolCalls.push(parsed)
    }

    return { visibleText, toolCalls }
  }
}
