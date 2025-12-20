/**
 * Tool execution hook for Ultrathink Plugin
 *
 * Strategy: best-effort redundancy.
 * - In tool mode and for target sessions, append an Ultrathink prompt to tool output.
 * - Message transform also injects Ultrathink turns and can append to tool parts.
 *
 * Duplication is acceptable; missing Ultrathink is not.
 */

import type { ToolInput, ToolOutput } from "./types.js"
import { buildThinkingPrompt } from "./thinking-prompts.js"
import { isToolOutputFailed } from "./utils.js"
import { logToFile } from "./logger.js"
import { shouldEnhanceSession } from "./session-state.js"

const TOOL_OUTPUT_MARKER = "[opencode-ultrathink:tool-output]"

export function createToolExecuteHook(config: any, hookState: any = {}) {
  return async (input: ToolInput, output: ToolOutput) => {
    const now = Date.now()
    hookState.toolExecute.lastFired = now

    if (!config.enabled || config.mode !== "tool") {
      return output
    }

    // Tool hooks don't include model info; gate using session state learned from message transforms.
    // If session state is unknown, we fail closed here but the fetch wrapper provides backup injection.
    if (!shouldEnhanceSession(input.sessionID)) {
      logToFile(`⏭️ Skipping tool output enhancement - session not in enhance cache: ${input.sessionID}`, "DEBUG")
      return output
    }

    const out: any = (output as any)?.output
    if (typeof out !== "string" || out.length === 0) {
      return output
    }

    // Avoid infinite growth if something replays tool outputs.
    if (out.includes(TOOL_OUTPUT_MARKER)) {
      return output
    }

    const failed = isToolOutputFailed(out) || Boolean((output as any)?.metadata?.error)
    const ultrathink = buildThinkingPrompt(config.prefix, failed)

    ;(output as any).output = `${out}\n\n${TOOL_OUTPUT_MARKER}\n${ultrathink}`

    hookState.toolExecute.lastSuccess = now
    logToFile(`🔧 Appended Ultrathink to tool output: ${input.tool} (failed=${failed})`, "DEBUG")

    return output
  }
}
