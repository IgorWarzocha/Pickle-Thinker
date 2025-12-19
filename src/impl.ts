/**
 * Ultrathink Plugin - Hybrid implementation using both fetch wrapper and OpenCode hooks
 * Combines direct API interception (master) with OpenCode pipeline integration (current)
 */

import type { Plugin } from "@opencode-ai/plugin"
import { getConfig } from "./config.js"
import { createTransformHandler } from "./message-transformer.js"
import { createToolExecuteHook } from "./tool-handler.js"
import { createSessionCompactionHandler } from "./session-compaction.js"
import { createSystemTransformHandler } from "./system-transformer.js"
import { clearLogFile, logToFile, setDebugMode } from "./logger.js"
import { initializeFetchWrapper } from "./fetch-wrapper.js"
import { logTargetModels } from "./model-filter.js"

// Event batching system for noise reduction
const eventCounts = new Map<string, number>()
let lastEventFlush = Date.now()
const FLUSH_INTERVAL = 5000 // Flush every 5 seconds

function flushEventCounts() {
  const now = Date.now()
  if (now - lastEventFlush < FLUSH_INTERVAL && Array.from(eventCounts.values()).reduce((a, b) => a + b, 0) < 50) {
    return // Don't flush too frequently unless we have lots of events
  }

  if (eventCounts.size > 0) {
    const summaries = Array.from(eventCounts.entries())
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => `${type} (x${count})`)
      .join(", ")

    if (summaries) {
      logToFile(`📊 EVENTS: ${summaries}`, "DEBUG")
    }

    eventCounts.clear()
    lastEventFlush = now
  }
}

// Track hook execution state for coordination
const hookState = {
  messageTransform: { lastFired: 0, lastSuccess: 0 },
  toolExecute: { lastFired: 0, lastSuccess: 0 },
  sessionStart: Date.now(),
}

export const implementation: Plugin = async (ctx) => {
  clearLogFile()
  logToFile("=== 🧠 ULTRATHINK PLUGIN HYBRID STARTING UP ===")
  logToFile(`Context keys: ${Object.keys(ctx).join(", ")}`)

  const config = getConfig(ctx)
  setDebugMode(config.debug || false)
  logToFile(`Config: ${JSON.stringify(config)}`)

  // Fetch wrapper is used for request injection in "lite" mode,
  // and for response sanitization in all modes.
  if (config.enabled) {
    initializeFetchWrapper(config, {
      injectRequests: config.mode === "lite",
      // This is the knob for repairing malformed tool calls/thinking blocks
      // that come back from the model as plain text.
      sanitizeResponses: config.interceptToolsInThinking === true,
    })
    logToFile(
      `🌐 Fetch wrapper enabled (injectRequests=${config.mode === "lite"}, sanitizeResponses=${config.interceptToolsInThinking === true})`,
      "DEBUG",
    )
  }

  const hooks: any = {}

  // Set up periodic flush to ensure events don't get stuck
  const flushInterval = setInterval(flushEventCounts, FLUSH_INTERVAL)

  // Clean up interval when plugin shuts down
  process.on("beforeExit", () => {
    clearInterval(flushInterval)
    flushEventCounts() // Final flush
  })

  // Smart event batching - groups identical events for cleaner logs
  hooks.event = async (input: { event: any }) => {
    const eventType = input.event?.type || "no-type"

    // Important events that should always be logged immediately
    const importantEvents = ["session.created", "tool.execute.after", "experimental.chat.messages.transform"]

    if (importantEvents.includes(eventType)) {
      flushEventCounts() // Flush any pending batches first
      logToFile(`🚨 EVENT: ${eventType}`, "DEBUG")
      return
    }

    // Batch noisy events
    eventCounts.set(eventType, (eventCounts.get(eventType) || 0) + 1)
    flushEventCounts() // Try to flush if conditions are met
  }

  // Avoid system-prompt mutation; keep the plugin scoped to model-gated message injections.
  // Hook to transform messages and inject thinking prompts (current approach)
  hooks["experimental.chat.messages.transform"] = createTransformHandler(config, hookState)

  // Hook to inject thinking during tool execution chains (current approach)
  hooks["tool.execute.after"] = createToolExecuteHook(config, hookState)

  // Hook to inject thinking during session compaction
  hooks["experimental.session.compacting"] = createSessionCompactionHandler(config)

  // Hook to inject thinking into the system prompt
  hooks["experimental.chat.system.transform"] = createSystemTransformHandler(config)

  logToFile(`PLUGIN LOADED WITH HOOKS: ${Object.keys(hooks).join(", ")}`, "DEBUG")
  logTargetModels(config.targetModels)
  logToFile(`🔄 Hybrid system initialized (fetch wrapper + hooks)`, "DEBUG")
  return hooks
}
