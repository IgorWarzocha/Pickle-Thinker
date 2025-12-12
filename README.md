# Pickle-Thinker

OpenCode plugin for GLM-4.6 / Big Pickle that auto-adds a steering prefix—set it to “Ultrathink:” or... any other reminder you want.

<img width="1024" height="559" alt="image" src="https://github.com/user-attachments/assets/c0975190-b6d7-4f8a-8fd3-c6850405cabd" />

Two modes (default: **tool**):

- **lite**: prefix the latest user message only.
- **tool**: after every tool call, inject a follow-up prompt; uses two variants (normal vs. failure-heuristic) for post-tool steering.

Config lives in `~/.config/opencode/pickle-thinker.jsonc` (auto-created) or `.opencode/pickle-thinker.jsonc` per project:

```jsonc
{
  // mode: "lite" keeps single-prefix behavior.
  // mode: "tool" adds an extra user turn after each tool result (more turns/tokens).
  "enabled": true,
  "mode": "tool",
  "prefix": "Ultrathink: ",
  "debug": false,
}
```

Heads-up: tool mode increases turns/tokens and may affect subscription usage.

### Steering hacks

- Set `prefix` to anything you like, e.g. `prefix: "Responde solo en español: "` to force language, or `prefix: "Read the docs before answering: "` to nudge behavior. You can drop the word “Ultrathink” entirely if you want.
  This behaves like a lightweight user-prompt hook (similar to Claude Code’s UserPromptSubmit), letting you bake reminders or constraints into every turn.

## Installation

### Option 1: npm (when published)

Add to your repository `opencode.json` or user-level `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["@howaboua/pickle-thinker@0.2.1"]
}
```

### Option 2: Manual folder install (for testing)

1. Build the plugin: `bun run build`
2. Copy the plugin folder to your target project:

```bash
# Option A: Install to specific project
cp -r /path/to/pickle-thinker/dist /your/project/.opencode/plugins/pickle-thinker

# Option B: Install to user-level plugins
mkdir -p ~/.config/opencode/plugins/pickle-thinker
cp -r /path/to/pickle-thinker/dist/* ~/.config/opencode/plugins/pickle-thinker/
```

3. Add to your `opencode.json`:

```json
{
  "plugin": ["./.opencode/plugins/pickle-thinker"]
}
```

or for user-level:

```json
{
  "plugin": ["~/.config/opencode/plugins/pickle-thinker"]
}
```

### Option 3: Git submodule (for development)

```bash
cd your-project
git submodule add https://github.com/howaboua/pickle-thinker .opencode/plugins/pickle-thinker
cd .opencode/plugins/pickle-thinker
bun run build
```

Then add to `opencode.json`:

```json
{
  "plugin": ["./.opencode/plugins/pickle-thinker"]
}
```

## How It Works

**Hybrid Architecture**: Uses dual-approach injection for maximum compatibility:
- **Fetch wrapper**: Intercepts API calls before they reach the model (master approach)
- **OpenCode hooks**: Transforms messages in the OpenCode pipeline (interleaved approach)

**Model filtering**: Only runs for `glm-4.6` and `big-pickle` models.

- Only runs for `glm-4.6` and `big-pickle`.
- Lite mode: prepend `prefix` to the most recent user message.
- Tool mode: insert `prefix` after each tool output; if the tool output looks like an error, swap to a “failed” prompt.

## Examples

- Lite mode (prefix only):  
  `User: Ultrathink: Explain quantum computing`

- Tool mode (auto-injected after a tool call):  
  `Ultrathink: Analyze the tool output and continue.`

- Tool mode (failure heuristic fired):  
  `Ultrathink: Tool output failed. Consider re-running the tool or re-reading the file before editing it.`

## Acknowledgments

This plugin was created using the [Dynamic Context Pruning](https://github.com/Tarquinen/opencode-dynamic-context-pruning) plugin by [Dan Tarquinen](https://github.com/Tarquinen) as a template. The DCP plugin provided the excellent fetch wrapper architecture and API format handling that made this implementation possible.
