import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "fs"
import { homedir } from "os"
import { dirname, join } from "path"
import type { PluginInput } from "@opencode-ai/plugin"

export type UltrathinkMode = "lite" | "tool"

export interface UltrathinkConfig {
  enabled: boolean
  prefix: string
  mode: UltrathinkMode
  debug?: boolean
  /**
   * Model IDs (substring match) that should receive Ultrathink injections.
   * Matched against a `${providerID}/${modelID}` key.
   */
  targetModels: string[]
}

const GLOBAL_DIR = join(homedir(), ".config", "opencode")
const GLOBAL_JSONC = join(GLOBAL_DIR, "pickle-thinker.jsonc")
const GLOBAL_JSON = join(GLOBAL_DIR, "pickle-thinker.json")

export const DEFAULT_TARGET_MODELS = [
  "glm-4.6",
  "zai/glm-4.6",
  "zai-coding-plan/glm-4.6",
  "big-pickle",
  "opencode/big-pickle",
]

const defaultConfig: UltrathinkConfig = {
  enabled: true,
  prefix: "Ultrathink: ",
  mode: "tool",
  debug: false,
  targetModels: DEFAULT_TARGET_MODELS,
}

function stripCommentsAndTrailingCommas(text: string): string {
  // Remove /* ... */ and // ... comments so JSON.parse can be used.
  let cleaned = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1")
  return cleaned
}

function findOpencodeDir(startDir?: string): string | null {
  if (!startDir) return null
  let current = startDir
  while (current !== "/") {
    const candidate = join(current, ".opencode")
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

function loadConfigFile(path: string): Partial<UltrathinkConfig> | null {
  try {
    const raw = readFileSync(path, "utf-8")
    const parsed = JSON.parse(stripCommentsAndTrailingCommas(raw))
    return parsed
  } catch {
    return null
  }
}

function ensureDefaultConfig(): void {
  if (existsSync(GLOBAL_JSONC) || existsSync(GLOBAL_JSON)) return
  if (!existsSync(GLOBAL_DIR)) mkdirSync(GLOBAL_DIR, { recursive: true })

  const content = `{
  // Ultrathink config for pickle-thinker
  // mode: "lite" keeps the original behavior (prefix user prompts only).
  // mode: "tool" adds an extra user turn after each tool result to force deeper analysis.
  // Note: tool mode increases turns/tokens and may impact subscription limits.
  "enabled": true,
  // "lite" | "tool"
  "mode": "tool",
  // Change thinking keyword if you like
  "prefix": "Ultrathink: ",
  // Enable debug logging to console/file
  "debug": false,
  // Models to enhance (substring match against "providerID/modelID")
  "targetModels": [
    "glm-4.6",
    "zai/glm-4.6",
    "zai-coding-plan/glm-4.6",
    "big-pickle",
    "opencode/big-pickle"
  ]
}
 `

  writeFileSync(GLOBAL_JSONC, content, "utf-8")
}

function getConfigPath(ctx?: PluginInput): string | null {
  // Prefer project-level config if present
  const projectDir = findOpencodeDir(ctx?.directory)
  if (projectDir) {
    const pj = join(projectDir, "pickle-thinker.jsonc")
    const pjJson = join(projectDir, "pickle-thinker.json")
    if (existsSync(pj)) return pj
    if (existsSync(pjJson)) return pjJson
  }

  if (existsSync(GLOBAL_JSONC)) return GLOBAL_JSONC
  if (existsSync(GLOBAL_JSON)) return GLOBAL_JSON
  return null
}

export function getConfig(ctx?: PluginInput): UltrathinkConfig {
  ensureDefaultConfig()

  const path = getConfigPath(ctx)
  if (!path) return { ...defaultConfig }

  const loaded = loadConfigFile(path)
  if (!loaded) return { ...defaultConfig }

  // Defensive: keep defaults if a key is the wrong type
  const enabled = typeof loaded.enabled === "boolean" ? loaded.enabled : defaultConfig.enabled
  const prefix = typeof loaded.prefix === "string" ? loaded.prefix : defaultConfig.prefix
  const mode = loaded.mode === "lite" || loaded.mode === "tool" ? loaded.mode : defaultConfig.mode
  const debug = typeof loaded.debug === "boolean" ? loaded.debug : defaultConfig.debug

  const targetModels =
    Array.isArray((loaded as any).targetModels) && (loaded as any).targetModels.every((m: any) => typeof m === "string")
      ? ((loaded as any).targetModels as string[])
      : defaultConfig.targetModels

  return { enabled, prefix, mode, debug, targetModels }
}
