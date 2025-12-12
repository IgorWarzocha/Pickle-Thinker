/**
 * Model filtering utilities for the Ultrathink Plugin
 * Centralizes target model definitions and filtering logic
 */
import { logToFile } from "./logger.js";
export const TARGET_MODELS = ["glm-4.6", "big-pickle"];
export function shouldEnhanceModel(modelId) {
    const shouldEnhance = TARGET_MODELS.some(target => modelId.includes(target));
    logToFile(`🎯 Model filtering: ${modelId} -> ${shouldEnhance ? 'ENHANCE' : 'SKIP'}`, "DEBUG");
    return shouldEnhance;
}
export function logTargetModels() {
    logToFile(`🎯 Target models: ${TARGET_MODELS.join(", ")}`);
}
