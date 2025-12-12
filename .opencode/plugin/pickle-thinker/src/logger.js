// @bun
// src/logger.ts
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
var LOG_FILE = join(dirname(fileURLToPath(import.meta.url)), "ultrathink-debug.log");
function logToFile(message, level = "INFO") {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}
`;
  try {
    writeFileSync(LOG_FILE, logLine, { flag: "a" });
  } catch (error) {
    console.log("Failed to write to log file:", error);
    console.log(message);
  }
}
function clearLogFile() {
  try {
    writeFileSync(LOG_FILE, "");
    logToFile("=== Ultrathink Plugin Session Started ===");
  } catch (error) {
    console.log("Failed to clear log file:", error);
  }
}
export {
  logToFile,
  clearLogFile
};
