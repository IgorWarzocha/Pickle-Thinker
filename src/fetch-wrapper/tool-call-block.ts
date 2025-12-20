/**
 * Tool call block parsing.
 * Converts malformed `<tool_call>` XML-ish blocks into a tool name and JSON arguments string.
 */

import { isOpencodeBuiltinToolId } from "./opencode-tool-ids.js"

type ParsedToolCall = {
  toolName: string
  arguments: string
}

export function parseToolCallBlock(toolCallXmlish: string): ParsedToolCall | null {
  const args: Record<string, unknown> = {}

  // Standard key/value pair: <arg_key>k</arg_key><arg_value>v</arg_value>
  for (const m of toolCallXmlish.matchAll(
    /<arg_key>\s*([\s\S]*?)\s*<\/arg_key>\s*<arg_value>\s*([\s\S]*?)\s*<\/arg_value>/gi,
  )) {
    const key = (m[1] || "").trim()
    const rawValue = (m[2] || "").trim()
    if (!key) continue
    args[key] = coerceValue(rawValue)
  }

  // Malformed key in tag name: <arg_keyfilePath</arg_key><arg_value>v</arg_value>
  for (const m of toolCallXmlish.matchAll(
    /<arg_key([A-Za-z0-9_]+)\s*<\/arg_key>\s*<arg_value>\s*([\s\S]*?)\s*<\/arg_value>/gi,
  )) {
    const key = (m[1] || "").trim()
    const rawValue = (m[2] || "").trim()
    if (!key) continue
    args[key] = coerceValue(rawValue)
  }

  const explicitToolName = extractExplicitToolName(toolCallXmlish, args)
  if (explicitToolName) {
    return {
      toolName: explicitToolName,
      arguments: JSON.stringify(stripToolNameFields(args)),
    }
  }

  const inferred = inferToolNameFromArgs(args)
  if (!inferred) return null

  return {
    toolName: inferred,
    arguments: JSON.stringify(args),
  }
}

function extractExplicitToolName(toolCallXmlish: string, args: Record<string, unknown>): string | null {
  // Attribute form: <tool_call name="read"> or <tool_call tool="read">
  const attrMatch = toolCallXmlish.match(/<tool_call\b[^>]*\b(?:name|tool)="([^"]+)"/i)
  if (attrMatch?.[1]) return attrMatch[1].trim()

  // Arg form: <arg_key>tool</arg_key><arg_value>read</arg_value>
  const argName = args.tool ?? args.name ?? args.toolName
  if (typeof argName === "string" && argName.trim().length > 0) return argName.trim()

  return null
}

function stripToolNameFields(args: Record<string, unknown>): Record<string, unknown> {
  const { tool, name, toolName, ...rest } = args
  return rest
}

function inferToolNameFromArgs(args: Record<string, unknown>): string | null {
  // Only infer tool names that are built-in to OpenCode.
  // Custom tool IDs vary by environment and should be explicit.

  // Batch
  if (Array.isArray((args as any).tool_calls)) return "batch"

  // File ops
  if (typeof args.filePath === "string" && typeof args.content === "string") return "write"
  if (
    typeof args.filePath === "string" &&
    typeof (args as any).oldString === "string" &&
    typeof (args as any).newString === "string"
  ) {
    return "edit"
  }
  if (typeof args.filePath === "string") return "read"

  // Search / listing
  if (
    typeof args.pattern === "string" &&
    (typeof args.include === "string" || typeof (args as any).path === "string")
  ) {
    // Grep uses `pattern`, optional `include`, optional `path`.
    return "grep"
  }
  if (typeof args.pattern === "string") return "glob"
  if (typeof (args as any).path === "string" && Array.isArray((args as any).ignore)) return "list"

  // Web
  if (typeof args.url === "string") return "webfetch"
  if (typeof args.query === "string" && typeof (args as any).tokensNum === "number") return "codesearch"
  if (typeof args.query === "string") return "websearch"

  // Agent
  if (typeof args.prompt === "string" && typeof (args as any).subagent_type === "string") return "task"

  // Shell
  if (typeof args.command === "string") return "bash"

  // Todo
  if (Array.isArray((args as any).todos)) return "todo_write"

  // Safety: only allow inferred built-ins.
  const fallback = typeof (args as any).tool === "string" ? ((args as any).tool as string) : null
  if (fallback && isOpencodeBuiltinToolId(fallback)) return fallback

  return null
}

function coerceValue(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return ""

  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}
