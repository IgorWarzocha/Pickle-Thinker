/**
 * Model filtering utilities for the Ultrathink Plugin
 * Centralizes target model definitions and filtering logic
 */

import { logToFile } from "./logger.js"
import { DEFAULT_TARGET_MODELS } from "./config.js"

export const TARGET_MODELS = DEFAULT_TARGET_MODELS

export function shouldEnhanceModel(modelId: string, targetModels: string[] = TARGET_MODELS): boolean {
  const shouldEnhance = targetModels.some((target) => modelId.includes(target))
  logToFile(`🎯 Model filtering: ${modelId} -> ${shouldEnhance ? "ENHANCE" : "SKIP"}`, "DEBUG")
  return shouldEnhance
}

export function logTargetModels(targetModels: string[] = TARGET_MODELS): void {
  logToFile(`🎯 Target models: ${targetModels.join(", ")}`)
}
