/**
 * File-based logging for Ultrathink Plugin
 * Overwrites log file on each run for clean debugging
 */
export declare function setDebugMode(enabled: boolean): void;
export declare function logToFile(message: string, level?: "INFO" | "ERROR" | "DEBUG"): void;
export declare function clearLogFile(): void;
