/**
 * Built-in tool IDs from OpenCode's `ToolRegistry`.
 * This is used for conservative inference when the model does not explicitly name the tool.
 */

export const OPENCODE_BUILTIN_TOOL_IDS = [
  "invalid",
  "bash",
  "read",
  "glob",
  "grep",
  "list",
  "edit",
  "write",
  "task",
  "webfetch",
  "todo_write",
  "todo_read",
  "websearch",
  "codesearch",
  "batch",
] as const

export type OpencodeBuiltinToolId = (typeof OPENCODE_BUILTIN_TOOL_IDS)[number]

export function isOpencodeBuiltinToolId(value: string): value is OpencodeBuiltinToolId {
  return (OPENCODE_BUILTIN_TOOL_IDS as readonly string[]).includes(value)
}
