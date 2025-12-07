# Ultrathink Plugin - Agent Guidelines

## Build/Development Commands
```bash
# Install dependencies
cd .opencode && npm install

# Type checking
cd .opencode && npx tsc --noEmit

# No test framework - manual testing by installing plugin in OpenCode
```

## Code Style Guidelines
- **Language**: TypeScript with strict type checking
- **Imports**: Use `import type` for type-only imports (see line 5)
- **Interfaces**: Define config interfaces with clear property types
- **Naming**: PascalCase for plugins/exported functions, camelCase for variables
- **Error Handling**: Use try-catch blocks with graceful fallbacks (line 65-67)
- **Functions**: Keep functions focused and single-purpose
- **Comments**: JSDoc style for main plugin description
- **Formatting**: Standard TypeScript formatting with 2-space indentation

## Project Structure
- Main plugin: `.opencode/plugin/ultrathink-plugin/index.ts`
- Package config: `.opencode/package.json`
- Plugin follows OpenCode plugin architecture with fetch wrapper pattern