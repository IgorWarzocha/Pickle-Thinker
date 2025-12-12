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

// src/logger.ts
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
var LOG_FILE = join(dirname(fileURLToPath(import.meta.url)), "ultrathink-debug.log");
function logToFile(message, level = "INFO") {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}
`;
  try {
    writeFileSync(LOG_FILE, logLine, { flag: "a" });
  } catch (error) {
    console.log("Failed to write to log file:", error);
    console.log(message);
  }
}
function clearLogFile() {
  try {
    writeFileSync(LOG_FILE, "");
    logToFile("=== Ultrathink Plugin Session Started ===");
  } catch (error) {
    console.log("Failed to clear log file:", error);
  }
}

// src/message-transformer.ts
function createTransformHandler(config) {
  return async (_, output) => {
    if (!config.enabled) {
      return;
    }
    const toolMode = config.mode === "tool";
    let injections = 0;
    if (toolMode) {
      const modified = transformMessagesForToolMode(output.messages, config.prefix);
      injections = modified ? 1 : 0;
    } else {
      const modified = transformMessagesForLiteMode(output.messages, config.prefix);
      injections = modified ? 1 : 0;
    }
    if (injections > 0) {
      logToFile(`Injected ${injections} thinking prompts in message transform`);
      logToFile(`Message transform mode: ${toolMode ? "tool" : "lite"}`, "DEBUG");
    }
    return;
  };
}
function transformMessagesForToolMode(messages, prefix) {
  if (messages.length === 0)
    return false;
  const newMessages = [];
  let thinkingInjections = 0;
  for (let i = 0;i < messages.length; i++) {
    const message = messages[i];
    newMessages.push(message);
    const hasActualToolExecution = message.parts.some((part) => {
      const type = part.type;
      const text = part.text || "";
      if (type === "tool_call" || type === "function_call" || type === "tool_use" || type === "tool_result" || type === "tool" || type === "function") {
        return true;
      }
      if (type === "text" && typeof text === "string") {
        const actualCommands = [
          text.includes("$") && text.length > 10,
          (text.includes("bash") || text.includes("npm") || text.includes("git")) && (text.includes("executed") || text.includes("running") || text.includes("output:")),
          text.includes("<bash>") || text.includes("</bash>")
        ];
        return actualCommands.some((cmd) => cmd);
      }
      return false;
    });
    if (hasActualToolExecution) {
      const failed = checkForFailure(message);
      const thinkingPrompt = buildThinkingPrompt(prefix, failed, message);
      newMessages.push({
        info: {
          role: "user",
          id: `ultrathink-${Date.now()}`,
          created: Date.now()
        },
        parts: [
          {
            type: "text",
            text: thinkingPrompt
          }
        ]
      });
      thinkingInjections++;
    }
  }
  const modified = thinkingInjections > 0;
  if (!modified) {
    ensureLastUserMessagePrefixed(newMessages, prefix);
  }
  messages.splice(0, messages.length, ...newMessages);
  return modified;
}
function transformMessagesForLiteMode(messages, prefix) {
  return ensureLastUserMessagePrefixed(messages, prefix);
}
function ensureLastUserMessagePrefixed(messages, prefix) {
  for (let i = messages.length - 1;i >= 0; i--) {
    const message = messages[i];
    if (message.info.role === "user") {
      let modified = false;
      for (const part of message.parts) {
        if (part.type === "text" && typeof part.text === "string") {
          if (!part.text.startsWith(prefix)) {
            part.text = prefix + part.text;
            modified = true;
          }
        }
      }
      return modified;
    }
  }
  return false;
}
function checkForFailure(message) {
  return message.parts.some((part) => {
    const output = part.output || part.content || part.text || "";
    const failWords = ["error", "failed", "exception", "traceback", "stack", "not found"];
    const checkString = (text) => {
      const lower = text.toLowerCase();
      if (failWords.some((w) => lower.includes(w)))
        return true;
      try {
        const parsed = JSON.parse(text);
        return checkForFailureFromContent(parsed);
      } catch {
        return false;
      }
    };
    if (typeof output === "string")
      return checkString(output);
    if (Array.isArray(output)) {
      return output.some((item) => {
        if (typeof item === "string")
          return checkString(item);
        if (item?.text && typeof item.text === "string")
          return checkString(item.text);
        return false;
      });
    }
    if (output && typeof output === "object") {
      return checkForFailureFromContent(output);
    }
    return false;
  });
}
function checkForFailureFromContent(content) {
  const failWords = ["error", "failed", "exception", "traceback", "stack", "not found"];
  const status = (content.status || content.state || content.result || content.error)?.toString().toLowerCase?.();
  if (status && !["completed", "success", "succeeded", "ok", "done"].includes(status))
    return true;
  return Object.values(content).some((v) => {
    if (typeof v === "string") {
      const lower = v.toLowerCase();
      return failWords.some((w) => lower.includes(w));
    }
    return false;
  });
}
export {
  createTransformHandler
};
