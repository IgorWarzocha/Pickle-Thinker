/**
 * Tool execution handling for the Ultrathink Plugin
 * Manages thinking injection during tool execution chains
 */
import { buildThinkingPrompt } from "./thinking-prompts.js";
import { isToolOutputFailed } from "./utils.js";
import { logToFile } from "./logger.js";
// Track recent injections to prevent duplicates
const recentInjections = new Map();
export function createToolExecuteHook(config, hookState = {}) {
    return async (input, output) => {
        const startTime = Date.now();
        hookState.toolExecute.lastFired = startTime;
        logToFile(`🔧 TOOL EXECUTE HOOK FIRED: ${input.tool}`, "DEBUG");
        if (!config.enabled || config.mode !== "tool") {
            logToFile(`❌ Plugin disabled or not in tool mode`, "DEBUG");
            return output;
        }
        // Note: ToolInput doesn't include model info, so we can't filter by model here
        // This hook will run for all tools, but thinking prompts will only be injected
        // for target models when they reach the message transformation stage
        logToFile(`⚠️ Tool handler: Model filtering not available at this stage`, "DEBUG");
        // Apply ultrathinking to EVERY tool - no skipping!
        // Apply thinking to ALL tools - no skipping logic
        // Only skip if no output at all
        if (!output.output) {
            logToFile(`⚠️ No output from ${input.tool} - skipping injection`, "DEBUG");
            return output;
        }
        // Debounce: prevent duplicate injections within 2 seconds
        const injectionKey = `${input.tool}-${JSON.stringify(output.output).slice(0, 100)}`;
        const now = Date.now();
        const lastInjection = recentInjections.get(injectionKey);
        if (lastInjection && now - lastInjection < 2000) {
            logToFile(`⚠️ Recent injection detected for ${input.tool} - skipping`, "DEBUG");
            return output;
        }
        recentInjections.set(injectionKey, now);
        // Clean old entries from the map (older than 30 seconds)
        for (const [key, timestamp] of recentInjections.entries()) {
            if (now - timestamp > 30000) {
                recentInjections.delete(key);
            }
        }
        const failed = isToolOutputFailed(output);
        logToFile(`📊 Tool ${input.tool} failed: ${failed}`, "DEBUG");
        const thinkingPrompt = buildThinkingPrompt(config.prefix, failed);
        modifyToolOutput(output, thinkingPrompt);
        const duration = Date.now() - startTime;
        hookState.toolExecute.lastSuccess = Date.now();
        // File logging for visibility
        logToFile(`✅ Injected thinking after ${input.tool}${failed ? " (detected failure)" : ""} (${duration}ms)`);
        logToFile(`Tool ${input.tool} output length: ${String(output.output)?.length || 0}`, "DEBUG");
        return output;
    };
}
function modifyToolOutput(output, thinkingPrompt) {
    if (typeof output.output === "string") {
        output.output = output.output + "\n\n" + thinkingPrompt;
    }
    else if (output.output && typeof output.output === "object") {
        if (output.output.text) {
            output.output.text = output.output.text + "\n\n" + thinkingPrompt;
        }
        else {
            output.output.thinking = thinkingPrompt;
        }
    }
}
