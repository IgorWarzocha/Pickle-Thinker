export const ULTRATHINK_KEYWORD = "Ultrathink"

/**
 * The instruction prefix for user messages.
 */
export const ULTRATHINK_INSTRUCTION = `Ultrathink before responding. You MUST begin your response with deep thinking about the task.`

export function getUltrathinkPrefixText(_prefix: string): string {
  // Always return the full instruction, not just the keyword
  return ULTRATHINK_INSTRUCTION
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

export function buildThinkingPrompt(_prefix: string, failed: boolean): string {
  // After tool execution, we need to force thinking before the next action
  const header = `Ultrathink about these results.`

  const successVariants = [
    "Analyze the output carefully. If the result achieves the goal, proceed. If not, determine what else is needed.",
    "Review what was returned. Think through whether this completes the task or requires follow-up.",
    "Examine the results. Consider if any adjustments are needed before moving forward.",
  ]

  const failureVariants = [
    "This failed. Analyze the error message carefully. Think about what went wrong and how to fix it.",
    "Error occurred. Stop and reason about the cause. What needs to change to succeed?",
    "Something went wrong. Before retrying, think through what the error means and how to correct it.",
  ]

  const body = failed ? pick(failureVariants) : pick(successVariants)
  return `${header} ${body}`
}
