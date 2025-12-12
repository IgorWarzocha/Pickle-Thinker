import type { PluginInput } from "@opencode-ai/plugin";
export type UltrathinkMode = "lite" | "tool";
export interface UltrathinkConfig {
    enabled: boolean;
    prefix: string;
    mode: UltrathinkMode;
    debug?: boolean;
}
export declare function getConfig(ctx?: PluginInput): UltrathinkConfig;
