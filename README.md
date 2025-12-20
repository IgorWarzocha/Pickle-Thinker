# Pickle-Thinker

OpenCode plugin for GLM-4.6 / Big Pickle that reliably injects the magic keyword `Ultrathink` so these models consistently enter “thinking mode”.

<img width="1024" height="559" alt="image" src="https://github.com/user-attachments/assets/c0975190-b6d7-4f8a-8fd3-c6850405cabd" />

Two modes (default: **tool**):

- **lite** (legacy): prefix only the latest user message.
- **tool** (recommended): redundancy-first injection so `Ultrathink` shows up in all the important places (user turns + tool returns).

## Configuration

Config lives in `~/.config/opencode/pickle-thinker.jsonc` (auto-created) or `.opencode/pickle-thinker.jsonc` per project:

```jsonc
{
  "enabled": true,
  // "lite" | "tool"
  "mode": "tool",
  // NOTE: `Ultrathink` is the magic word for these models.
  // If you set `prefix` to something else, the plugin still forces `Ultrathink`.
  "prefix": "Ultrathink: ",
  "debug": false,
  // Detect and fix tools that are mistakenly placed within thinking blocks
  "interceptToolsInThinking": true,
  // Target models (substring match)
  "targetModels": [
    "glm-4.6",
    "zai/glm-4.6",
    "zai-coding-plan/glm-4.6",
    "big-pickle",
    "opencode/big-pickle"
  ]
}
```

Heads-up: `tool` mode increases turns/tokens and may affect subscription usage.

## How It Works

This plugin only activates for the target models (GLM-4.6 + Big Pickle). For those models:

- **Every user message is forced to start with `Ultrathink`** (as a dedicated leading text part).
- **After tool results**, the plugin injects a synthetic user “continue + ultrathink” message so the model can think _between_ tool calls.
- **Tool outputs and tool errors are also appended with an `Ultrathink` block** as an extra safety net.
- **Session Compaction**: When conversations get too long and are summarized, the plugin re-injects instructions to ensure the model stays in thinking mode.

Duplication is intentional; missing `Ultrathink` is the bug.

### Notes on prefix

- `Ultrathink` is required for GLM-4.6 / Big Pickle to think.
- You can still customize `prefix`, but the plugin ensures the first token the model sees is `Ultrathink`.

## Installation

Add to your repository `opencode.json` or user-level `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["@howaboua/pickle-thinker@0.4.0"]
}
```

Other installation methods (manual folder installs, submodules) are intentionally unsupported/legacy as of `0.3.0`.

## Examples

- User turn (forced):
  - First thing the model sees in each user message: `Ultrathink`

- After any tool result (synthetic interleave turn):
  - `Ultrathink about these results. Analyze the output carefully...`
  - `Ultrathink about these results. Review what was returned...`

- Tool output appended (extra safety net):
  - Tool output will also contain an `Ultrathink` block (with a small marker tag) so even “weird” tool flows still surface the keyword.

## Acknowledgments

This plugin was created using the [Dynamic Context Pruning](https://github.com/Tarquinen/opencode-dynamic-context-pruning) plugin by [Dan Tarquinen](https://github.com/Tarquinen) as a template. The DCP plugin provided the excellent fetch wrapper architecture and API format handling that made this implementation possible.
