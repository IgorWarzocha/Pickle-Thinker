/**
 * Session compaction handler for Ultrathink Plugin
 * Injects thinking instructions into compaction context
 */

import { logToFile } from "./logger.js"

export function createSessionCompactionHandler(config: any) {
  return async (input: { sessionID: string }, output: { context: string[] }) => {
    logToFile(
      `🗜️ SESSION COMPACTION HOOK FIRED for session ${input.sessionID} (${output.context.length} context parts)`,
    )

    if (!config.enabled) {
      logToFile(`❌ Plugin disabled - skipping compaction handler`, "DEBUG")
      return
    }

    const thinkingPrefix = "Ultrathink before executing the following: "

    // Prepend thinking instruction to existing context
    output.context.unshift(thinkingPrefix)

    logToFile(`✅ Injected thinking prefix into compaction context`, "DEBUG")
    return
  }
}
