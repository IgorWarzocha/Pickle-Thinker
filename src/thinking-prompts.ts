export const ULTRATHINK_KEYWORD = "Ultrathink"

export function getUltrathinkPrefixText(prefix: string): string {
  const trimmed = typeof prefix === "string" ? prefix.trim() : ""
  if (!trimmed) return ULTRATHINK_KEYWORD

  // Keep any configured prefix that still starts with "Ultrathink".
  if (trimmed.toLowerCase().startsWith("ultrathink")) {
    // Preserve the user's formatting (e.g. "Ultrathink:"), but keep it short.
    const firstLine = trimmed.split("\n")[0] ?? trimmed
    return firstLine.trimEnd()
  }

  // If user configured something else, still force the magic keyword.
  return ULTRATHINK_KEYWORD
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

export function buildThinkingPrompt(prefix: string, failed: boolean): string {
  const header = getUltrathinkPrefixText(prefix)

  const successVariants = [
    "Continue.",
    "Review the tool output carefully, then continue.",
    "Consider the tool output; proceed deliberately.",
    "Think through the implications, then continue.",
  ]

  const failureVariants = [
    "The tool failed. Re-check inputs, then decide next step.",
    "The output looks failed or incomplete. Diagnose and retry if needed.",
    "Treat this as a failure case; verify assumptions and continue.",
  ]

  const body = failed ? pick(failureVariants) : pick(successVariants)
  return `${header}\n\n${body}`
}
