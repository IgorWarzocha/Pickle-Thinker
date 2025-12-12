// @bun
// src/config.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
var GLOBAL_DIR = join(homedir(), ".config", "opencode");
var GLOBAL_JSONC = join(GLOBAL_DIR, "pickle-thinker.jsonc");
var GLOBAL_JSON = join(GLOBAL_DIR, "pickle-thinker.json");
var defaultConfig = {
  enabled: true,
  prefix: "Ultrathink: ",
  mode: "tool"
};
function stripCommentsAndTrailingCommas(text) {
  let cleaned = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
  return cleaned;
}
function findOpencodeDir(startDir) {
  if (!startDir)
    return null;
  let current = startDir;
  while (current !== "/") {
    const candidate = join(current, ".opencode");
    if (existsSync(candidate) && statSync(candidate).isDirectory())
      return candidate;
    const parent = dirname(current);
    if (parent === current)
      break;
    current = parent;
  }
  return null;
}
function loadConfigFile(path) {
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(stripCommentsAndTrailingCommas(raw));
    return parsed;
  } catch {
    return null;
  }
}
function ensureDefaultConfig() {
  if (existsSync(GLOBAL_JSONC) || existsSync(GLOBAL_JSON))
    return;
  if (!existsSync(GLOBAL_DIR))
    mkdirSync(GLOBAL_DIR, { recursive: true });
  const content = `{
  // Ultrathink config for pickle-thinker
  // mode: "lite" keeps the original behavior (prefix user prompts only).
  // mode: "tool" adds an extra user turn after each tool result to force deeper analysis.
  // Note: tool mode increases turns/tokens and may impact subscription limits.
  "enabled": true,
  // "lite" | "tool"
  "mode": "tool",
  // Change the thinking keyword if you like
  "prefix": "Ultrathink: "
}
`;
  writeFileSync(GLOBAL_JSONC, content, "utf-8");
}
function getConfigPath(ctx) {
  const projectDir = findOpencodeDir(ctx?.directory);
  if (projectDir) {
    const pj = join(projectDir, "pickle-thinker.jsonc");
    const pjJson = join(projectDir, "pickle-thinker.json");
    if (existsSync(pj))
      return pj;
    if (existsSync(pjJson))
      return pjJson;
  }
  if (existsSync(GLOBAL_JSONC))
    return GLOBAL_JSONC;
  if (existsSync(GLOBAL_JSON))
    return GLOBAL_JSON;
  return null;
}
function getConfig(ctx) {
  ensureDefaultConfig();
  const path = getConfigPath(ctx);
  if (!path)
    return { ...defaultConfig };
  const loaded = loadConfigFile(path);
  if (!loaded)
    return { ...defaultConfig };
  const enabled = typeof loaded.enabled === "boolean" ? loaded.enabled : defaultConfig.enabled;
  const prefix = typeof loaded.prefix === "string" ? loaded.prefix : defaultConfig.prefix;
  const mode = loaded.mode === "lite" || loaded.mode === "tool" ? loaded.mode : defaultConfig.mode;
  return { enabled, prefix, mode };
}
export {
  getConfig
};
