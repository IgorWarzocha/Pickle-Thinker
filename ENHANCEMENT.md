# Pickle-Thinker Enhancement

## Changes Made

The plugin has been enhanced to use `experimental.chat.messages.transform` hook instead of fetch interception.

## Key Improvements

1. **Better Reliability**: Message transformation hook intercepts all message types before they're sent to any provider, not just HTTP requests
2. **Type Safety**: Works with structured message objects instead of raw HTTP bodies
3. **Provider Agnostic**: No need to handle different providers (OpenAI, Anthropic) separately
4. **Cleaner Code**: Eliminates the need for HTTP request/response parsing

## Implementation Details

The new implementation:

- Uses `experimental.chat.messages.transform` hook
- Transforms messages at the OpenCode message level
- Preserves all existing functionality (lite/tool modes, failure detection)
- Maintains backward compatibility with existing config

## Important Notes

- **Experimental**: The `experimental.chat.messages.transform` hook is only available on the dev branch
- **Testing**: This must be tested on the dev branch
- **Fallback**: Keep the old implementation as a backup for stable versions

## Migration

When this is ready for production:

1. Keep both implementations
2. Add feature detection for the hook
3. Fall back to fetch interception if hook is not available
