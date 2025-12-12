// REMOVED: All filtering functions that limited when thinking prompts would trigger
// The plugin now triggers on ALL relevant events without filtering

export function buildThinkingPrompt(prefix: string, failed: boolean, context?: any): string {
  // Simple, always-on thinking prompt - no filtering
  if (failed) {
    return `${prefix}Tool output failed. Consider re-running the tool or re-reading the file before editing it.`
  }
  return `${prefix}Analyze the tool output and continue.`
}

function getThinkingKeyword(): string {
  return "ultrathink"
}

export function buildContextAwarePrompt(keyword: string, context?: any, failed?: boolean): string {
  // Prompts focused on thinking and analysis - not quality validation
  const prompts = [
    "take time to analyze this thoroughly.",
    "think through all implications here.",
    "consider this from multiple angles.",
    "break this down systematically.",
    "work through this step by step.",
    "analyze each component carefully.",
    "consider next steps carefully.",
    "think about how this scales.",
    "consider long-term implications.",
    "process this information methodically.",
    "work through this systematically.",
    "consider implications before proceeding.",
    "approach this methodically.",
  ]

  const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)]

  // Simple context modifier - no complex filtering
  let prefixModifier = ""
  if (failed) {
    prefixModifier = "Given failure, "
  }

  return prefixModifier + randomPrompt
}
