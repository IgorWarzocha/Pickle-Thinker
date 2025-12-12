// @bun
// src/thinking-prompts.ts
function hasToolContent(message) {
  return message.parts?.some((part) => {
    const type = part.type;
    const text = part.text || "";
    if (type === "tool_call" || type === "function_call" || type === "tool_use" || type === "tool_result" || type === "tool" || type === "function") {
      return true;
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
        "failed"
      ];
      return toolKeywords.some((keyword) => text.toLowerCase().includes(keyword));
    }
    return false;
  });
}
function isComplexMessage(message) {
  const totalLength = message.parts.reduce((sum, part) => {
    return sum + (part.text || "").length;
  }, 0);
  return totalLength > 150 || message.parts.length > 2;
}
function isComplexUserRequest(message) {
  const text = message.parts.reduce((combined, part) => {
    return combined + (part.text || "");
  }, "");
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
    "build"
  ];
  return complexityIndicators.some((indicator) => text.toLowerCase().includes(indicator)) && text.length > 50;
}
function buildThinkingPrompt(prefix, failed, context) {
  const thinkingKeyword = getThinkingKeyword();
  const basePrompt = buildContextAwarePrompt(thinkingKeyword, context, failed);
  return `${thinkingKeyword} ${basePrompt}`;
}
function getThinkingKeyword() {
  return "ultrathink";
}
function buildContextAwarePrompt(keyword, context, failed) {
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
    "through this approach to ensure it covers all requirements properly."
  ];
  const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
  let prefixModifier = "";
  if (failed) {
    prefixModifier = "Given the failure, ";
  } else if (context && hasToolContent(context)) {
    prefixModifier = "Given the tool execution, ";
  } else if (context && context.info.role === "assistant" && isComplexMessage(context)) {
    prefixModifier = "Regarding the complex response above, ";
  } else if (context && context.info.role === "user" && isComplexUserRequest(context)) {
    prefixModifier = "For this complex request, ";
  }
  return prefixModifier + randomPrompt;
}
export {
  isComplexUserRequest,
  isComplexMessage,
  hasToolContent,
  buildThinkingPrompt,
  buildContextAwarePrompt
};
