type SessionEnhanceState = {
  enhance: boolean
  modelKey: string
  updatedAt: number
}

const sessionEnhance = new Map<string, SessionEnhanceState>()

export function setSessionEnhanceState(sessionID: string, enhance: boolean, modelKey: string) {
  sessionEnhance.set(sessionID, {
    enhance,
    modelKey,
    updatedAt: Date.now(),
  })
}

export function shouldEnhanceSession(sessionID: string): boolean {
  return sessionEnhance.get(sessionID)?.enhance === true
}

export function getSessionEnhanceState(sessionID: string): SessionEnhanceState | undefined {
  return sessionEnhance.get(sessionID)
}
