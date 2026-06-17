import Anthropic from "@anthropic-ai/sdk";

/**
 * Lazy-loaded Anthropic client.
 * Does NOT crash on startup if ANTHROPIC_API_KEY is missing.
 * The anthropicClient.ts layer handles the error gracefully at call time.
 */
let _anthropicInstance: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
    if (!_anthropicInstance) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error(
                "ANTHROPIC_API_KEY is not set. Set this environment variable to enable Claude integration."
            );
        }
        _anthropicInstance = new Anthropic({ apiKey });
    }
    return _anthropicInstance;
}

// Backward-compatible export for existing anthropicService.ts
// Only fails at call time, not at import time
export const anthropic = new Proxy({} as Anthropic, {
    get(_target, prop) {
        const client = getAnthropicClient();
        return (client as any)[prop];
    }
});