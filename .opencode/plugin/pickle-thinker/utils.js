/**
 * Utility functions for tool output analysis and failure detection
 */
const FAIL_WORDS = ["error", "failed", "exception", "traceback", "stack", "not found"];
export function isToolOutputFailed(content) {
    const checkString = (text) => {
        const lower = text.toLowerCase();
        if (FAIL_WORDS.some((w) => lower.includes(w)))
            return true;
        try {
            const parsed = JSON.parse(text);
            return isToolOutputFailed(parsed);
        }
        catch {
            return false;
        }
    };
    if (typeof content === "string")
        return checkString(content);
    if (Array.isArray(content)) {
        return content.some((part) => {
            if (typeof part === "string")
                return checkString(part);
            if (part?.text && typeof part.text === "string")
                return checkString(part.text);
            return false;
        });
    }
    if (content && typeof content === "object") {
        const status = (content.status || content.state || content.result || content.error)?.toString().toLowerCase?.();
        if (status && !["completed", "success", "succeeded", "ok", "done"].includes(status))
            return true;
        return Object.values(content).some((v) => {
            if (typeof v === "string")
                return checkString(v);
            return false;
        });
    }
    return false;
}
