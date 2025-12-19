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
    "Tool execution complete. If the result is satisfactory, proceed to the next step.",
    "Action successful. If no further changes are needed for this specific task, move on.",
    "Update applied. Verify it briefly; if good, proceed.",
    "Output received. If this completes the immediate requirement, advance to the next objective.",
  ]

  const failureVariants = [
    "The tool failed. Analyze the error message and retry with a fix.",
    "Action failed. Check the inputs and correct your approach.",
    "Error detected. Diagnose the issue and attempt a valid alternative.",
  ]

  const body = failed ? pick(failureVariants) : pick(successVariants)
  return `${header}\n\n${body}`
}
