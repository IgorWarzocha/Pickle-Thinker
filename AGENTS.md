# Agent Guidelines for Pickle Thinker

## Commands
- **Build**: `npm run build` (cleans `dist/` and compiles via `tsc`)
- **Type Check**: `npx tsc --noEmit`
- **Test**: `src/test-tool-interceptor.ts` is a self-contained test suite. Run with `npx tsx src/test-tool-interceptor.ts`.
- **Lint**: Adhere to `tsconfig.json` strict mode.

## Core Architecture
- **Hybrid System**:
  1.  **Fetch Wrapper** (`src/fetch-wrapper.ts`): Patches `globalThis.fetch`. Primary mechanism.
  2.  **OpenCode Hooks** (`src/impl.ts`): Secondary mechanism for tool outputs (`tool.execute.after`) and session events.

## Key Logic Components
- **Request Injection** (`src/fetch-wrapper/request-injector.ts`):
  - "Bulletproof" injection: ensures every user message starts with `Ultrathink`.
  - Varies prompts based on tool success/failure (detects "error", "exception").
- **Response Sanitization** (`src/fetch-wrapper/openai-responses-sse.ts`):
  - Intercepts SSE streams (`text/event-stream`).
  - Buffers and rewrites text-based `<tool_call>` blocks into proper OpenAI `function_call` events.
  - **Tool Inference** (`src/fetch-wrapper/tool-call-block.ts`): Infers tool names from arguments if missing (e.g., `filePath` + `content` -> `write`).
- **Session Compaction** (`src/session-compaction.ts`):
  - Re-injects "Ultrathink" prefix when context is summarized/pruned to maintain state.
- **Tool Repair** (`src/tool-interceptor.ts`):
  - Fixes unclosed/unopened `[think]` blocks.
  - Rescues tool calls hallucinated inside thinking blocks.

## Code Style
- **Stack**: TypeScript (ESNext), Node.js.
- **Imports**: `import type` for types. `node:` prefix for built-ins.
- **Error Handling**: Typed errors; do not swallow failures.
