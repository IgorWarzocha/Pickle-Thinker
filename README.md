# Ultrathink Plugin

A simple OpenCode plugin that automatically injects "Ultrathink: " before user prompts for GLM-4.6 and Big Pickle models, encouraging the AI to engage in deeper, more thoughtful reasoning.

## What It Does

The Ultrathink plugin modifies your outgoing messages to AI services by prepending "Ultrathink: " to each user prompt **only when using GLM-4.6 or Big Pickle models**. This simple prefix can help elicit more detailed, analytical responses from these specific AI models by signaling that you want them to engage in deeper thinking about your request.

## Installation

Add to your repository `opencode.json` or user-level `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["@howaboua/pickle-thinker"]
}
```

## How It Works

- **Model-specific**: Only activates for GLM-4.6 (`glm-4.6`) and Big Pickle (`big-pickle`) models
- **Intercepts API calls**: Monitors fetch requests to AI providers
- **Injects prefix**: Automatically adds "Ultrathink: " to the beginning of your user messages for supported models
- **Format-agnostic**: Works with different API formats while preserving message structure
- **Transparent**: No changes to your workflow - just better AI responses when using supported models

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