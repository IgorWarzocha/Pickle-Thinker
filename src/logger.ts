/**
 * File-based logging for Ultrathink Plugin
 * Overwrites log file on each run for clean debugging
 */

import { writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const LOG_FILE = join(dirname(fileURLToPath(import.meta.url)), "ultrathink-debug.log")

let debugMode = false

export function setDebugMode(enabled: boolean): void {
  debugMode = enabled
}

export function logToFile(message: string, level: "INFO" | "ERROR" | "DEBUG" = "INFO"): void {
  // Skip DEBUG logs when not in debug mode
  if (level === "DEBUG" && !debugMode) {
    return
  }

  const timestamp = new Date().toISOString()
  const logLine = `[${timestamp}] [${level}] ${message}\n`

  try {
    writeFileSync(LOG_FILE, logLine, { flag: "a" })
  } catch (error) {
    // Fallback to console if file write fails
    console.log("Failed to write to log file:", error)
    console.log(message)
  }
}

export function clearLogFile(): void {
  try {
    writeFileSync(LOG_FILE, "")
    logToFile("=== Ultrathink Plugin Session Started ===")
  } catch (error) {
    console.log("Failed to clear log file:", error)
  }
}
