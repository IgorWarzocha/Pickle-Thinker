/**
 * Message transformation logic for Ultrathink Plugin
 * Handles injection of thinking prompts into message arrays
 */

import type { MessageWithParts } from "./types.js"
import { buildThinkingPrompt } from "./thinking-prompts.js"
import { logToFile } from "./logger.js"
import { shouldEnhanceModel } from "./model-filter.js"

export function createTransformHandler(config: any, hookState: any = {}) {
  return async (input: any, output: { messages: MessageWithParts[] }) => {
    const startTime = Date.now()
    hookState.messageTransform.lastFired = startTime
    logToFile(`🔍 MESSAGE TRANSFORM HOOK FIRED (${output.messages.length} messages)`)

    if (!config.enabled) {
      logToFile(`❌ Plugin disabled - skipping transform`, "DEBUG")
      return
    }

    // Filter for target models only
    const modelId = input.model || ""
    if (!shouldEnhanceModel(modelId)) {
      return
    }

    const toolMode = config.mode === "tool"
    let injections = 0
    const initialMessageCount = output.messages.length

    if (toolMode) {
      const modified = transformMessagesForToolMode(output.messages, config.prefix)
      injections = modified ? 1 : 0
    } else {
      const modified = transformMessagesForLiteMode(output.messages, config.prefix)
      injections = modified ? 1 : 0
    }

    const endTime = Date.now()
    const duration = endTime - startTime

    if (injections > 0) {
      hookState.messageTransform.lastSuccess = Date.now()
      logToFile(
        `✅ Injected ${injections} thinking prompts (${toolMode ? "tool" : "lite"} mode, ${duration}ms, ${initialMessageCount}→${output.messages.length} messages)`,
      )
    } else {
      logToFile(`⚠️ No injections (${toolMode ? "tool" : "lite"} mode, ${duration}ms) - no tool executions`)
    }

    return
  }
}

function transformMessagesForToolMode(messages: MessageWithParts[], prefix: string): boolean {
  if (messages.length === 0) {
    return false
  }

  const newMessages: MessageWithParts[] = []
  let thinkingInjections = 0
  let toolExecutionsFound = 0

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    newMessages.push(message)

    // In tool mode, inject ultrathink after every user message
    if (message.info.role === "user") {
      const hasActualToolExecution = message.parts.some((part) => {
        const type = part.type
        const text = part.text || ""

        if (
          type === "tool_call" ||
          type === "function_call" ||
          type === "tool_use" ||
          type === "tool" ||
          type === "function"
        ) {
          return true
        }

        if (type === "text" && typeof text === "string") {
          const actualCommands = [
            text.includes("$") && text.length > 10,
            (text.includes("bash") || text.includes("npm") || text.includes("git")) &&
              (text.includes("executed") || text.includes("running") || text.includes("output:")),
            text.includes("<bash>") || text.includes("</bash>"),
          ]

          if (actualCommands.some((cmd) => cmd)) {
            return true
          }
        }

        return false
      })

      if (hasActualToolExecution) {
        toolExecutionsFound++
      }

      const failed = hasActualToolExecution ? checkForFailure(message) : false
      const thinkingPrompt = buildThinkingPrompt(prefix, failed, message)

      newMessages.push({
        info: {
          role: "user",
          id: `ultrathink-${Date.now()}-${i}`,
          created: Date.now(),
        },
        parts: [
          {
            type: "text",
            text: thinkingPrompt,
          },
        ],
      })
      thinkingInjections++
      logToFile(
        `💭 Injection ${thinkingInjections}: ${hasActualToolExecution ? `tool execution ${failed ? "(failed)" : "(success)"}` : "user message"} in message ${i + 1}`,
        "DEBUG",
      )
    }
  }

  const modified = thinkingInjections > 0

  if (!modified) {
    ensureLastUserMessagePrefixed(newMessages, prefix)
  }

  messages.splice(0, messages.length, ...newMessages)
  return modified
}

function transformMessagesForLiteMode(messages: MessageWithParts[], prefix: string): boolean {
  return ensureLastUserMessagePrefixed(messages, prefix)
}

function ensureLastUserMessagePrefixed(messages: MessageWithParts[], prefix: string): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.info.role === "user") {
      let modified = false
      for (const part of message.parts) {
        if (part.type === "text" && typeof part.text === "string") {
          if (!part.text.startsWith(prefix)) {
            part.text = prefix + part.text
            modified = true
          }
        }
      }
      return modified
    }
  }
  return false
}

function checkForFailure(message: MessageWithParts): boolean {
  return message.parts.some((part) => {
    const output = part.output || part.content || part.text || ""

    const failWords = ["error", "failed", "exception", "traceback", "stack", "not found"]
    const checkString = (text: string): boolean => {
      const lower = text.toLowerCase()
      if (failWords.some((w) => lower.includes(w))) return true
      try {
        const parsed = JSON.parse(text)
        return checkForFailureFromContent(parsed)
      } catch {
        return false
      }
    }

    if (typeof output === "string") return checkString(output)

    if (Array.isArray(output)) {
      return output.some((item) => {
        if (typeof item === "string") return checkString(item)
        if (item?.text && typeof item.text === "string") return checkString(item.text)
        return false
      })
    }

    if (output && typeof output === "object") {
      return checkForFailureFromContent(output)
    }

    return false
  })
}

function checkForFailureFromContent(content: any): boolean {
  const failWords = ["error", "failed", "exception", "traceback", "stack", "not found"]

  const status = (content.status || content.state || content.result || content.error)?.toString().toLowerCase?.()
  if (status && !["completed", "success", "succeeded", "ok", "done"].includes(status)) return true

  return Object.values(content).some((v: any) => {
    if (typeof v === "string") {
      const lower = v.toLowerCase()
      return failWords.some((w) => lower.includes(w))
    }
    return false
  })
}
