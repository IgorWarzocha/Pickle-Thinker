/**
 * Message transformation logic for Ultrathink Plugin
 * Handles injection of thinking prompts into message arrays
 */
import type { MessageWithParts } from "./types.js";
export declare function createTransformHandler(config: any, hookState?: any): (input: any, output: {
    messages: MessageWithParts[];
}) => Promise<void>;
