/**
 * Tool interceptor for fixing tools mistakenly placed within thinking blocks
 * Detects and extracts tool calls from thinking content and moves them to proper message parts
 * Also detects and fixes malformed thinking blocks ([think][/think] patterns)
 */

import type { MessageWithParts } from "./types.js"
import { logToFile } from "./logger.js"

interface ToolCallMatch {
  toolName: string
  parameters: string
  fullMatch: string
  startIndex: number
  endIndex: number
}

interface ToolFixResult {
  fixed: boolean
  extractedTools: ToolCallMatch[]
  cleanedThinking: string
  newToolParts: Array<{ type: "tool"; tool: string; input: any }>
}

interface ThinkingBlockFix {
  fixed: boolean
  originalText: string
  fixedText: string
  issue: "unclosed" | "unopened" | "nested" | "none"
}

const TOOL_PATTERN =
  /<invoke\s+name="([^"]+)">\s*(<parameter\s+name="([^"]+)">\s*(.*?)\s*<\/parameter>\s*)*\s*<\/invoke>/gs

// Some models output tool calls as a <tool_call> XML-ish block.
// We treat that as an embedded tool call that must be extracted into a proper tool part.
const TOOL_CALL_BLOCK_PATTERN = /<tool_call(?:\s+[^>]*)?>[\s\S]*?<\/tool_call>/gi

// Simplified / inline tool call pattern, e.g. read({"filePath":"x"}).
const SIMPLIFIED_TOOL_PATTERN = /(?:^|\n)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)\s*$/gm

// Actual thinking block patterns used by models
const THINKING_START_PATTERNS = [/\[\s*think\s*\]\s*/i, /<\s*think\s*>\s*/i]

// End markers should be detected anywhere in the text.
// Anchoring to end-of-string breaks cases like "</think>\n<tool_call>..." or "</think>\n\nfinal answer".
const THINKING_END_PATTERNS = [/\[\s*\/\s*think\s*\]/i, /<\s*\/\s*think\s*>/i]

function extractToolCalls(content: string): ToolCallMatch[] {
  const tools: ToolCallMatch[] = []

  // Try to match structured tool calls first
  let match
  while ((match = TOOL_PATTERN.exec(content)) !== null) {
    const fullMatch = match[0]
    const toolName = match[1]

    // Extract parameters from nested parameter tags
    const paramMatches = fullMatch.matchAll(/<parameter\s+name="([^"]+)">\s*(.*?)\s*<\/parameter>/gs)
    const parameters: Record<string, any> = {}

    for (const paramMatch of paramMatches) {
      const paramName = paramMatch[1]
      const paramValue = paramMatch[2].trim()

      try {
        parameters[paramName] = JSON.parse(paramValue)
      } catch {
        parameters[paramName] = paramValue
      }
    }

    tools.push({
      toolName,
      parameters: JSON.stringify(parameters),
      fullMatch,
      startIndex: match.index,
      endIndex: match.index + fullMatch.length,
    })
  }

  // If no structured tools found, try simplified pattern
  if (tools.length === 0) {
    TOOL_PATTERN.lastIndex = 0
    while ((match = SIMPLIFIED_TOOL_PATTERN.exec(content)) !== null) {
      const toolName = match[1]
      const paramsStr = match[2].trim()

      try {
        const parameters = JSON.parse(`{${paramsStr}}`)
        tools.push({
          toolName,
          parameters: JSON.stringify(parameters),
          fullMatch: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        })
      } catch {
        // Skip if we can't parse parameters
        continue
      }
    }
  }

  return tools
}

function createToolPart(toolMatch: ToolCallMatch): { type: "tool"; tool: string; input: any } {
  let input: any

  try {
    input = JSON.parse(toolMatch.parameters)
  } catch {
    input = { query: toolMatch.parameters }
  }

  return {
    type: "tool",
    tool: toolMatch.toolName,
    input,
  }
}

function detectThinkingBlockIssues(text: string): ThinkingBlockFix {
  const originalText = text

  // Count thinking block markers
  let hasStartMarker = false
  let hasEndMarker = false

  for (const pattern of THINKING_START_PATTERNS) {
    if (pattern.test(text)) {
      hasStartMarker = true
      break
    }
  }

  for (const pattern of THINKING_END_PATTERNS) {
    if (pattern.test(text)) {
      hasEndMarker = true
      break
    }
  }

  // Detect issues
  if (!hasStartMarker && hasEndMarker) {
    // Has end but no start
    // Check if the end tag is angle-bracket style
    const isAngleBracket = THINKING_END_PATTERNS[1].test(text)
    const startTag = isAngleBracket ? "<think>" : "[think]"

    const fixedText = `${startTag}\n` + text.trim()
    return {
      fixed: true,
      originalText,
      fixedText,
      issue: "unopened",
    }
  }

  if (hasStartMarker && !hasEndMarker) {
    // Has start but no end
    // Check if the start tag is angle-bracket style
    const isAngleBracket = THINKING_START_PATTERNS[1].test(text)
    const endTag = isAngleBracket ? "</think>" : "[/think]"

    let fixedText = text.trim()
    fixedText += `\n\n${endTag}`

    return {
      fixed: true,
      originalText,
      fixedText,
      issue: "unclosed",
    }
  }

  // Check for nested thinking blocks
  let startCount = 0
  let endCount = 0

  for (const pattern of THINKING_START_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, "gi"))
    startCount += Array.from(matches).length
  }

  for (const pattern of THINKING_END_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, "gi"))
    endCount += Array.from(matches).length
  }

  if (startCount > 1 || endCount > 1) {
    return {
      fixed: true,
      originalText,
      fixedText: text, // Keep as-is for now, just flag the issue
      issue: "nested",
    }
  }

  return {
    fixed: false,
    originalText,
    fixedText: text,
    issue: "none",
  }
}

function fixThinkingBlocks(message: MessageWithParts): ThinkingBlockFix[] {
  const fixes: ThinkingBlockFix[] = []

  if (message.info?.role !== "assistant") {
    return fixes
  }

  if (!Array.isArray(message.parts)) {
    return fixes
  }

  for (const part of message.parts) {
    if (part?.type !== "text" || typeof part.text !== "string") {
      continue
    }

    const fix = detectThinkingBlockIssues(part.text)
    if (fix.fixed) {
      part.text = fix.fixedText
      fixes.push(fix)
    }
  }

  return fixes
}

function fixToolsInThinking(message: MessageWithParts): ToolFixResult {
  if (message.info?.role !== "assistant") {
    return { fixed: false, extractedTools: [], cleanedThinking: "", newToolParts: [] }
  }

  if (!Array.isArray(message.parts)) {
    return { fixed: false, extractedTools: [], cleanedThinking: "", newToolParts: [] }
  }

  const allToolMatches: ToolCallMatch[] = []
  const updatedParts: Array<{ type: string; text?: string; tool?: string; input?: any }> = []
  let hasFixes = false

  for (const part of message.parts) {
    if (part?.type !== "text" || typeof part.text !== "string") {
      updatedParts.push(part)
      continue
    }

    const text = part.text

    // Debug logging
    logToFile(`🐛 Checking text: ${JSON.stringify(text)}`, "DEBUG")
    logToFile(`🐛 Contains [think]: ${text.includes("[think]")}`, "DEBUG")
    logToFile(`🐛 Contains tool pattern: ${SIMPLIFIED_TOOL_PATTERN.test(text)}`, "DEBUG")

    // Reset regex lastIndex first
    TOOL_PATTERN.lastIndex = 0
    SIMPLIFIED_TOOL_PATTERN.lastIndex = 0

    // Always check for tools if text has content - remove early filtering
    // The regex patterns will determine if tools exist

    const toolMatches = extractToolCalls(text)

    if (toolMatches.length === 0) {
      updatedParts.push(part)
      continue
    }

    hasFixes = true
    allToolMatches.push(...toolMatches)

    // Remove tool calls from thinking text, working backwards to preserve indices
    let cleanedText = text
    for (let i = toolMatches.length - 1; i >= 0; i--) {
      const toolMatch = toolMatches[i]
      cleanedText = cleanedText.slice(0, toolMatch.startIndex) + cleanedText.slice(toolMatch.endIndex)
    }

    // Add marker to indicate tools were extracted
    if (cleanedText.trim() !== text.trim()) {
      cleanedText = cleanedText.trim() + "\n\n[🔧 Tools extracted from thinking block and moved to proper execution]"
    }

    updatedParts.push({
      type: "text",
      text: cleanedText,
    })
  }

  // Create tool parts for extracted tools
  const newToolParts = allToolMatches.map(createToolPart)

  // Update message parts if fixes were made
  if (hasFixes) {
    message.parts = [...updatedParts, ...newToolParts]
  }

  return {
    fixed: hasFixes,
    extractedTools: allToolMatches,
    cleanedThinking: updatedParts.find((p) => p.type === "text")?.text || "",
    newToolParts,
  }
}

export function fixToolsInThinkingBlocks(messages: MessageWithParts[]): { fixed: number; totalExtracted: number } {
  let fixed = 0
  let totalExtracted = 0

  for (const message of messages) {
    const result = fixToolsInThinking(message)
    if (result.fixed) {
      fixed++
      totalExtracted += result.extractedTools.length

      logToFile(
        `🔧 Fixed ${result.extractedTools.length} tools in thinking block: ${result.extractedTools.map((t) => t.toolName).join(", ")}`,
      )
    }
  }

  if (fixed > 0) {
    logToFile(`🔧 Total: Fixed ${fixed} messages, extracted ${totalExtracted} tools from thinking blocks`)
  }

  return { fixed, totalExtracted }
}

export function fixThinkingBlockIssues(messages: MessageWithParts[]): { fixed: number; issues: ThinkingBlockFix[] } {
  let fixed = 0
  const allIssues: ThinkingBlockFix[] = []

  for (const message of messages) {
    const fixes = fixThinkingBlocks(message)
    if (fixes.length > 0) {
      fixed++
      allIssues.push(...fixes)

      for (const fix of fixes) {
        if (fix.issue === "unclosed") {
          logToFile(`🔧 Fixed unclosed thinking block`)
        } else if (fix.issue === "unopened") {
          logToFile(`🔧 Fixed unopened thinking block`)
        } else if (fix.issue === "nested") {
          logToFile(`⚠️ Detected nested thinking blocks`)
        }
      }
    }
  }

  if (fixed > 0) {
    logToFile(`🔧 Total: Fixed ${fixed} messages with thinking block issues`)
  }

  return { fixed, issues: allIssues }
}

export function fixAllMessageIssues(messages: MessageWithParts[]): {
  thinkingFixes: number
  toolFixes: number
  totalExtracted: number
  thinkingIssues: ThinkingBlockFix[]
} {
  const toolResult = fixToolsInThinkingBlocks(messages)
  const thinkingResult = fixThinkingBlockIssues(messages)

  return {
    thinkingFixes: thinkingResult.fixed,
    toolFixes: toolResult.fixed,
    totalExtracted: toolResult.totalExtracted,
    thinkingIssues: thinkingResult.issues,
  }
}
