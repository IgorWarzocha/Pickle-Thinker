/**
 * Type definitions for the Ultrathink Plugin
 * Defines interfaces for messages, configuration, and tool outputs
 */

export interface UltrathinkConfig {
  enabled: boolean
  prefix: string
  mode: "lite" | "tool"
}

export interface MessageWithParts {
  info: MessageInfo
  parts: MessagePart[]
}

export interface MessageInfo {
  role: string
  id?: string
  created?: number
}

export interface StepFinishPart {
  type: "step-finish"
  reason: "tool-calls" | "stop" | "length" | "content-filter" | "function-call" | "unknown"
}

export type MessagePart =
  | StepFinishPart
  | {
      type: string
      text?: string
      output?: any
      content?: any
      [key: string]: any
    }

export interface ToolInput {
  tool: string
  sessionID: string
  callID: string
}

export interface ToolOutput {
  output: string | object | any
  status?: string
  state?: string
  result?: any
  error?: any
}

export interface TransformOutput {
  messages: MessageWithParts[]
}
