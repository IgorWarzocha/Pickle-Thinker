// REMOVED: All filtering functions that limited when thinking prompts would trigger
// The plugin now triggers on ALL relevant events without filtering
export function buildThinkingPrompt(prefix, failed, context) {
    // Simple, always-on thinking prompt - no filtering
    if (failed) {
        return `${prefix}Tool output failed. Consider re-running the tool or re-reading the file before editing it.`;
    }
    return `${prefix}Analyze the tool output and continue.`;
}
function getThinkingKeyword() {
    return "ultrathink";
}
export function buildContextAwarePrompt(keyword, context, failed) {
    // Simplified prompts - no complex filtering
    const prompts = [
        "analyze this situation and proceed systematically.",
        "consider all aspects before taking action.",
        "think through this step by step.",
        "evaluate the current state and continue.",
        "process this information methodically.",
        "work through this systematically.",
        "consider implications before proceeding.",
        "approach this methodically.",
    ];
    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
    // Simple context modifier - no complex filtering
    let prefixModifier = "";
    if (failed) {
        prefixModifier = "Given failure, ";
    }
    return prefixModifier + randomPrompt;
}
