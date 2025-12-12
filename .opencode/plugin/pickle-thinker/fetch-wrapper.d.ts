/**
 * Fetch wrapper implementation from master branch
 * Intercepts API calls to inject thinking prompts before they reach the AI model
 */
interface FetchWrapperConfig {
    enabled: boolean;
    prefix: string;
    mode: "lite" | "tool";
}
export declare function initializeFetchWrapper(config: FetchWrapperConfig): void;
export {};
