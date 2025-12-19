/**
 * Types shared by the fetch wrapper modules.
 * Keeps request injection and response sanitization loosely coupled.
 */

export interface FetchWrapperConfig {
  enabled: boolean
  prefix: string
  mode: "lite" | "tool"
  targetModels?: string[]
}

export type FetchWrapperOptions = {
  injectRequests?: boolean
  sanitizeResponses?: boolean
}
