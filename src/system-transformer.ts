/**
 * System prompt transformation handler for Ultrathink Plugin
 * Injects thinking instructions into the system prompt
 */

import { logToFile } from "./logger.js"

export function createSystemTransformHandler(config: any) {
  return async (_: any, output: { system: string[] }) => {
    logToFile(`🧠 SYSTEM TRANSFORM HOOK FIRED (${output.system.length} system parts)`)

    if (!config.enabled) {
      logToFile(`❌ Plugin disabled - skipping system transform`, "DEBUG")
      return
    }

    const thinkingInstructions =
      "Ultrathink at all times. Do not reply unless you are thinking deeply about the task at hand."

    output.system.push(thinkingInstructions)

    logToFile(`✅ Injected thinking instructions into system prompt`, "DEBUG")
    return
  }
}
