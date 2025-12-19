/**
 * OpenAI-compatible SSE sanitization.
 * Handles both OpenAI Responses-style chunks (with a `type` field) and Chat Completions chunks (with `choices[].delta`).
 */

import { randomUUID } from "crypto"
import { parseToolCallBlock } from "./tool-call-block.js"

type RewriterOptions = {
  onToolCallRewritten?: (toolName: string) => void
}

type Mode = "unknown" | "responses" | "chat"

export function sanitizeOpenAISseEventStream(response: Response, options: RewriterOptions = {}): Response {
  const body = response.body
  if (!body) return response

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  let mode: Mode = "unknown"

  let buffer = ""

  // Shared tool_call capture across deltas
  let inToolCall = false
  let toolCallBuffer = ""

  // Responses-mode state
  let maxOutputIndex = -1

  const output = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true })

        while (true) {
          const boundary = buffer.indexOf("\n\n")
          if (boundary === -1) break

          const eventBlock = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)

          controller.enqueue(encoder.encode(rewriteEventBlock(eventBlock)))
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

    if (mode === "unknown") {
      mode = detectMode(json)
    }

    if (mode === "responses" && typeof json?.output_index === "number") {
      maxOutputIndex = Math.max(maxOutputIndex, json.output_index)
    }

    const rewritten =
      mode === "responses" ? rewriteResponsesChunk(json) : mode === "chat" ? rewriteChatChunk(json) : [json]

    return rewritten.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("")
  }

  function detectMode(firstJson: any): Mode {
    if (typeof firstJson?.type === "string") {
      return "responses"
    }

    if (Array.isArray(firstJson?.choices)) {
      return "chat"
    }

    return "unknown"
  }

  // Streaming-friendly thinking wrapper stripping.
  // Models sometimes split tags across deltas, e.g. "</th" + "ink>".
  // Avoid TDZ issues by using `var` and lazy prefix checks.
  var danglingThinkPrefix: string | undefined

  function stripThinkingWrappers(text: string): string {
    const combined = (danglingThinkPrefix ?? "") + text
    danglingThinkPrefix = ""

    // Remove any complete markers (case-insensitive).
    let cleaned = combined.replace(/<\/?think>\s*/gi, "").replace(/\[\/?think\]\s*/gi, "")

    const split = splitDanglingThinkingPrefix(cleaned)
    danglingThinkPrefix = split.dangling
    cleaned = split.visible

    return cleaned
  }

  function splitDanglingThinkingPrefix(text: string): { visible: string; dangling: string } {
    const markers = ["<think>", "</think>", "[think]", "[/think]"]

    // Avoid buffering overly-generic fragments.
    const max = Math.min(text.length, 8)
    for (let len = max; len >= 3; len--) {
      const suffix = text.slice(-len)
      const lowered = suffix.toLowerCase()

      if (!lowered.includes("th")) continue
      if (!markers.some((m) => m.startsWith(lowered))) continue

      return { visible: text.slice(0, -len), dangling: suffix }
    }

    return { visible: text, dangling: "" }
  }

  function extractToolCallsFromText(text: string): {
    visibleText: string
    toolCalls: Array<{ toolName: string; arguments: string }>
  } {
    let remaining = stripThinkingWrappers(text)

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

  function rewriteResponsesChunk(chunk: any): any[] {
    if (chunk?.type !== "response.output_text.delta" || typeof chunk?.delta !== "string") {
      return [chunk]
    }

    const { visibleText, toolCalls } = extractToolCallsFromText(chunk.delta)
    const injected: any[] = []

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

  function rewriteChatChunk(chunk: any): any[] {
    if (!Array.isArray(chunk?.choices)) {
      return [chunk]
    }

    const injected: any[] = []
    const choices = chunk.choices.map((choice: any, choiceIndex: number) => {
      const delta = choice?.delta
      if (!delta || typeof delta !== "object") return choice

      if (typeof delta.content !== "string") return choice

      const { visibleText, toolCalls } = extractToolCallsFromText(delta.content)

      if (toolCalls.length > 0) {
        // Generate tool_call chunks (standard OpenAI chat streaming shape).
        let callIndex = 0
        for (const toolCall of toolCalls) {
          const toolCallId = `call_${randomUUID()}`

          injected.push({
            ...chunk,
            choices: [
              {
                index: choiceIndex,
                delta: {
                  tool_calls: [
                    {
                      index: callIndex,
                      id: toolCallId,
                      type: "function",
                      function: {
                        name: toolCall.toolName,
                        arguments: toolCall.arguments,
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          })

          injected.push({
            ...chunk,
            choices: [
              {
                index: choiceIndex,
                delta: {},
                finish_reason: "tool_calls",
              },
            ],
          })

          options.onToolCallRewritten?.(toolCall.toolName)
          callIndex++
        }
      }

      return {
        ...choice,
        delta: {
          ...delta,
          content: visibleText,
        },
      }
    })

    return [{ ...chunk, choices }, ...injected]
  }
}
