/**
 * Tool execution handling for the Ultrathink Plugin
 * Manages thinking injection during tool execution chains
 */
import type { ToolInput, ToolOutput } from "./types.js";
export declare function createToolExecuteHook(config: any, hookState?: any): (input: ToolInput, output: ToolOutput) => Promise<ToolOutput>;
