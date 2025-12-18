/**
 * Message transformation logic for Ultrathink Plugin
 *
 * Reliability-first strategy for target models:
 * - Ensure every user message begins with the magic keyword "Ultrathink".
 * - After tool results (tool parts), inject a synthetic user message to force an
 *   interleaved-thought step.
 * - Also append an Ultrathink prompt into tool output/error strings (best-effort),
 *   including batched/parallel tool parts that bypass tool hooks.
 */

import type { MessageWithParts } from "./types.js"
import { buildThinkingPrompt, getUltrathinkPrefixText } from "./thinking-prompts.js"
import { logToFile } from "./logger.js"
import { shouldEnhanceModel } from "./model-filter.js"
import { isToolOutputFailed } from "./utils.js"
import { setSessionEnhanceState } from "./session-state.js"

type AnyMessage = MessageWithParts & {
  info: any
  parts: any[]
}

const USER_AFTER_TOOL_MARKER = "[opencode-ultrathink:user-after-tool]"
const TOOL_PART_MARKER = "[opencode-ultrathink:tool-part]"

function getModelKeyFromMessages(messages: AnyMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const info: any = messages[i]?.info
    if (!info) continue

    if (info.role === "user") {
      const providerID = info.model?.providerID
      const modelID = info.model?.modelID
      if (typeof providerID === "string" && typeof modelID === "string") {
        return `${providerID}/${modelID}`
      }
    }

    if (info.role === "assistant") {
      const providerID = info.providerID
      const modelID = info.modelID
      if (typeof providerID === "string" && typeof modelID === "string") {
        return `${providerID}/${modelID}`
      }
    }
  }

  return ""
}

function getSessionIDFromMessages(messages: AnyMessage[]): string {
  for (const msg of messages) {
    const sessionID = msg?.info?.sessionID
    if (typeof sessionID === "string" && sessionID.length > 0) return sessionID

    if (Array.isArray(msg?.parts)) {
      for (const part of msg.parts) {
        if (typeof part?.sessionID === "string" && part.sessionID.length > 0) return part.sessionID
      }
    }
  }
  return ""
}

function isTextPart(part: any): part is { type: "text"; text: string } {
  return part?.type === "text" && typeof part.text === "string"
}

function ensureUltrathinkOnUserMessage(message: AnyMessage, prefixText: string): boolean {
  if (message.info?.role !== "user") return false
  if (!Array.isArray(message.parts)) return false

  for (const part of message.parts) {
    if (!isTextPart(part)) continue

    // If the user already starts with Ultrathink (maybe manual), do nothing.
    if (part.text.trimStart().toLowerCase().startsWith("ultrathink")) return false

    message.parts.unshift({
      type: "text",
      text: prefixText,
    })
    return true
  }

  message.parts.unshift({
    type: "text",
    text: prefixText,
  })
  return true
}

function ensureUltrathinkOnAllUserMessages(messages: AnyMessage[], prefixText: string): number {
  let modified = 0
  for (const message of messages) {
    if (ensureUltrathinkOnUserMessage(message, prefixText)) modified++
  }
  return modified
}

function ensureUltrathinkOnLastUserMessage(messages: AnyMessage[], prefixText: string): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.info?.role === "user") {
      return ensureUltrathinkOnUserMessage(messages[i], prefixText)
    }
  }
  return false
}

function assistantHasToolParts(message: AnyMessage): { hasTool: boolean; failed: boolean } {
  if (message.info?.role !== "assistant") return { hasTool: false, failed: false }
  if (!Array.isArray(message.parts)) return { hasTool: false, failed: false }

  let hasTool = false
  let failed = false

  for (const part of message.parts) {
    if (part?.type !== "tool") continue
    const status = part?.state?.status
    if (status === "completed") {
      hasTool = true
    }
    if (status === "error") {
      hasTool = true
      failed = true
    }
  }

  return { hasTool, failed }
}

function appendUltrathinkToToolParts(messages: AnyMessage[], prefix: string): number {
  let modified = 0

  for (const message of messages) {
    if (message.info?.role !== "assistant" || !Array.isArray(message.parts)) continue

    for (const part of message.parts) {
      if (part?.type !== "tool" || !part?.state) continue

      const status = part.state.status
      if (status !== "completed" && status !== "error") continue

      if (status === "completed") {
        const output = part.state.output
        if (typeof output !== "string" || output.length === 0) continue
        if (output.includes(TOOL_PART_MARKER)) continue

        const failed = isToolOutputFailed(output)
        const ultrathink = buildThinkingPrompt(prefix, failed)
        part.state.output = `${output}\n\n${TOOL_PART_MARKER}\n${ultrathink}`
        modified++
      }

      if (status === "error") {
        const errorText = part.state.error
        if (typeof errorText !== "string" || errorText.length === 0) continue
        if (errorText.includes(TOOL_PART_MARKER)) continue

        const ultrathink = buildThinkingPrompt(prefix, true)
        part.state.error = `${errorText}\n\n${TOOL_PART_MARKER}\n${ultrathink}`
        modified++
      }
    }
  }

  return modified
}

function injectAfterToolMessages(messages: AnyMessage[], prefix: string): number {
  let injections = 0

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    const { hasTool, failed } = assistantHasToolParts(message)
    if (!hasTool) continue

    const assistantID = typeof message.info?.id === "string" ? message.info.id : `assistant-${i}`
    const injectedID = `ultrathink-after-${assistantID}`

    // Deduplicate: if the exact injected message already exists anywhere, skip.
    if (messages.some((m) => m?.info?.id === injectedID)) {
      continue
    }

    const ultrathink = buildThinkingPrompt(prefix, failed)

    messages.splice(i + 1, 0, {
      info: {
        role: "user",
        id: injectedID,
        created: Date.now(),
      },
      parts: [
        {
          type: "text",
          text: `${USER_AFTER_TOOL_MARKER}\n${ultrathink}`,
        },
      ],
    })

    injections++
    i++
  }

  return injections
}

export function createTransformHandler(config: any, hookState: any = {}) {
  return async (_input: any, output: { messages: AnyMessage[] }) => {
    const startTime = Date.now()
    hookState.messageTransform.lastFired = startTime

    if (!config.enabled) {
      logToFile(`❌ Plugin disabled - skipping transform`, "DEBUG")
      return
    }

    const sessionID = getSessionIDFromMessages(output.messages)
    const modelKey = getModelKeyFromMessages(output.messages)
    const enhance = shouldEnhanceModel(modelKey, (config as any).targetModels)

    if (sessionID) {
      setSessionEnhanceState(sessionID, enhance, modelKey)
    }

    if (!enhance) {
      logToFile(`🎯 Skipping message transform for model: ${modelKey || "unknown"}`, "DEBUG")
      return
    }

    const prefix = typeof config.prefix === "string" ? config.prefix : "Ultrathink: "
    const prefixText = getUltrathinkPrefixText(prefix) + "\n\n"

    const toolMode = config.mode === "tool"
    const initialMessageCount = output.messages.length

    let userPrefixCount = 0
    let toolPartAppends = 0
    let toolTurnInjections = 0

    if (toolMode) {
      userPrefixCount = ensureUltrathinkOnAllUserMessages(output.messages, prefixText)
      toolPartAppends = appendUltrathinkToToolParts(output.messages, prefix)
      toolTurnInjections = injectAfterToolMessages(output.messages, prefix)
    } else {
      userPrefixCount = ensureUltrathinkOnLastUserMessage(output.messages, prefixText) ? 1 : 0
    }

    const duration = Date.now() - startTime

    if (userPrefixCount > 0 || toolPartAppends > 0 || toolTurnInjections > 0) {
      hookState.messageTransform.lastSuccess = Date.now()
      logToFile(
        `✅ Ultrathink injected (mode=${toolMode ? "tool" : "lite"}, model=${modelKey}, prefixed=${userPrefixCount}, toolPartAppends=${toolPartAppends}, toolTurns=${toolTurnInjections}, ${duration}ms, ${initialMessageCount}→${output.messages.length} messages)`,
      )
    } else {
      logToFile(`⚠️ No changes (mode=${toolMode ? "tool" : "lite"}, model=${modelKey}, ${duration}ms)`, "DEBUG")
    }
  }
}
