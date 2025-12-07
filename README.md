# Ultrathink Plugin

A simple OpenCode plugin that automatically injects "Ultrathink: " before every user prompt, encouraging the AI to engage in deeper, more thoughtful reasoning.

## What It Does

The Ultrathink plugin modifies your outgoing messages to AI services by prepending "Ultrathink: " to each user prompt. This simple prefix can help elicit more detailed, analytical responses from AI models by signaling that you want them to engage in deeper thinking about your request.

## Installation

You have two options for installing the Ultrathink plugin:

### Option 1: Install in your repository (recommended)
1. Clone or download this plugin to your project:
```bash
git clone https://github.com/IgorWarzocha/Pickle-Thinker.git
```

2. Copy the plugin to your project's `.opencode` directory:
```bash
cp -r Pickle-Thinker/.opencode/plugin/ultrathink-plugin ./.opencode/plugin/
```

3. Add the plugin to your project's `opencode.json` configuration:
```json
{
  "plugin": ["./.opencode/plugin/ultrathink-plugin"],
  "$schema": "https://opencode.ai/config.json"
}
```

### Option 2: Install globally
1. Clone or download this plugin to your global OpenCode plugins directory:
```bash
git clone https://github.com/IgorWarzocha/Pickle-Thinker.git ~/.config/opencode/plugin/Pickle-Thinker
```

2. Copy the plugin to the global plugins directory:
```bash
cp -r Pickle-Thinker/.opencode/plugin/ultrathink-plugin ~/.config/opencode/plugin/
```

3. Add the plugin to your global `opencode.json` configuration:
```json
{
  "plugin": ["./ultrathink-plugin"],
  "$schema": "https://opencode.ai/config.json"
}
```

3. Restart OpenCode and the plugin will automatically start working.

## How It Works

- **Intercepts API calls**: Monitors fetch requests to AI providers (OpenAI, Anthropic, Gemini)
- **Injects prefix**: Automatically adds "Ultrathink: " to the beginning of your user messages
- **Format-agnostic**: Works with different API formats while preserving message structure
- **Transparent**: No changes to your workflow - just better AI responses

## Example

Without the plugin:
```
User: Explain quantum computing
```

With the plugin:
```
User: Ultrathink: Explain quantum computing
```

## Acknowledgments

This plugin was created using the [Dynamic Context Pruning](https://github.com/Tarquinen/opencode-dynamic-context-pruning) plugin by [Dan Tarquinen](https://github.com/Tarquinen) as a template. The DCP plugin provided the excellent fetch wrapper architecture and API format handling that made this implementation possible.