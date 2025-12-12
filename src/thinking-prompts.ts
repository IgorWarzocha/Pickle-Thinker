export function hasToolContent(message: any): boolean {
  return message.parts?.some((part: any) => {
    const type = part.type
    const text = part.text || ""

    if (
      type === "tool_call" ||
      type === "function_call" ||
      type === "tool_use" ||
      type === "tool_result" ||
      type === "tool" ||
      type === "function"
    ) {
      return true
    }

    if (type === "text" && typeof text === "string") {
      const toolKeywords = [
        "tool",
        "bash",
        "command",
        "execute",
        "run",
        "npm",
        "git",
        "function",
        "call",
        "use",
        "let me",
        "i will",
        "output:",
        "result:",
        "error:",
        "failed",
      ]
      return toolKeywords.some((keyword) => text.toLowerCase().includes(keyword))
    }

    return false
  })
}

export function isComplexMessage(message: any): boolean {
  const totalLength = message.parts.reduce((sum: number, part: any) => {
    return sum + ((part as any).text || "").length
  }, 0)

  // Complex if over 150 chars or has multiple parts
  return totalLength > 150 || message.parts.length > 2
}

export function isComplexUserRequest(message: any): boolean {
  const text = message.parts.reduce((combined: string, part: any) => {
    return combined + ((part as any).text || "")
  }, "")

  // Complex user requests
  const complexityIndicators = [
    "explain",
    "how to",
    "why",
    "what is",
    "implement",
    "create",
    "fix",
    "debug",
    "analyze",
    "optimize",
    "refactor",
    "build",
  ]

  return complexityIndicators.some((indicator) => text.toLowerCase().includes(indicator)) && text.length > 50
}

export function buildThinkingPrompt(prefix: string, failed: boolean, context?: any): string {
  // Always use ultrathink
  const thinkingKeyword = getThinkingKeyword()
  // Build context-aware thinking prompt
  const basePrompt = buildContextAwarePrompt(thinkingKeyword, context, failed)
  // Apply thinking keyword as prefix (not separate prefix)
  return `${thinkingKeyword} ${basePrompt}`
}

function getThinkingKeyword(): string {
  return "ultrathink"
}

export function buildContextAwarePrompt(keyword: string, context?: any, failed?: boolean): string {
  // Randomized ultrathink prompts
  const prompts = [
    "about the current situation and allocate maximum tokens to solve this systematically.",
    "through all implications and constraints before proceeding with optimal strategy.",
    "step by step to develop a comprehensive solution for this problem.",
    "methodically about all aspects before executing the optimal approach.",
    "systematically through this problem to determine the best course of action.",
    "carefully about every detail before moving forward with implementation.",
    "through this scenario to identify all potential issues and solutions.",
    "about the requirements and constraints before deciding on the approach.",
    "step by step through the problem space to find the optimal solution.",
    "methodically analyze all possibilities before committing to a strategy.",
    "about what just happened and determine the best next steps to take.",
    "through the implications before proceeding with the next action.",
    "systematically evaluate all options before making a decision.",
    "carefully consider all aspects before implementing the solution.",
    "through this approach to ensure it covers all requirements properly.",
  ]

  const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)]

  // Add context-specific modifiers
  let prefixModifier = ""
  if (failed) {
    prefixModifier = "Given the failure, "
  } else if (context && hasToolContent(context)) {
    prefixModifier = "Given the tool execution, "
  } else if (context && context.info.role === "assistant" && isComplexMessage(context)) {
    prefixModifier = "Regarding the complex response above, "
  } else if (context && context.info.role === "user" && isComplexUserRequest(context)) {
    prefixModifier = "For this complex request, "
  }

  return prefixModifier + randomPrompt
}
