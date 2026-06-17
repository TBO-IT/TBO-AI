// ─── Anthropic Client ─────────────────────────────────────────────────────────
//
// Production-grade Anthropic API client with:
//   - Multi-model support (Haiku / Sonnet)
//   - Retry with exponential backoff
//   - Timeout handling
//   - Token budget enforcement
//   - Input sanitization
//   - Cost tracking integration
//   - Graceful failure
//
// Environment: ANTHROPIC_API_KEY
// ───────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { ClaudeTier } from "./claudeRouter.js";
import { trackClaudeUsage } from "./claudeCostTracker.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_PROMPT_LENGTH = 50_000; // characters — safety cap

const MODELS: Record<Exclude<ClaudeTier, "NONE">, string> = {
    HAIKU:  "claude-3-5-haiku-20241022",
    SONNET: "claude-3-5-sonnet-20241022"
};

// ─── Client Initialization ────────────────────────────────────────────────────

let _client: Anthropic | null = null;

function getClient(): Anthropic {
    if (!_client) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new AnthropicClientError(
                "ANTHROPIC_API_KEY is not set. Claude integration is disabled.",
                "CONFIG_ERROR"
            );
        }
        _client = new Anthropic({ apiKey });
    }
    return _client;
}

// ─── Error Types ──────────────────────────────────────────────────────────────

export type AnthropicErrorCode =
    | "CONFIG_ERROR"
    | "RATE_LIMITED"
    | "TIMEOUT"
    | "OVERLOADED"
    | "SERVER_ERROR"
    | "INVALID_RESPONSE"
    | "PROMPT_TOO_LONG"
    | "MAX_RETRIES_EXCEEDED";

export class AnthropicClientError extends Error {
    constructor(
        message: string,
        public readonly code: AnthropicErrorCode,
        public readonly status?: number
    ) {
        super(message);
        this.name = "AnthropicClientError";
    }
}

// ─── Core API ─────────────────────────────────────────────────────────────────

export interface GenerateTextOptions {
    prompt: string;
    systemPrompt: string;
    tier: Exclude<ClaudeTier, "NONE">;
    maxTokens: number;
    temperature?: number;
    operation: string;
}

export interface GenerateTextResult {
    text: string;
    inputTokens: number;
    outputTokens: number;
    model: string;
    latencyMs: number;
}

/**
 * Core text generation function.
 * Sends a prompt to Claude and returns the raw text response.
 */
export async function generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
    // 1. Input sanitization
    validatePrompt(options.prompt);

    const model = MODELS[options.tier];
    const startTime = performance.now();

    console.log(
        `[CLAUDE_INPUT] tier=${options.tier} | model=${model} | ` +
        `operation=${options.operation} | maxTokens=${options.maxTokens} | ` +
        `promptLength=${options.prompt.length}`
    );

    // 2. Retry loop
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const client = getClient();
            const response = await client.messages.create({
                model,
                max_tokens: options.maxTokens,
                temperature: options.temperature ?? 0.0,
                system: options.systemPrompt,
                messages: [{ role: "user", content: options.prompt }]
            });

            const latencyMs = Math.round(performance.now() - startTime);
            const inputTokens = response.usage?.input_tokens ?? 0;
            const outputTokens = response.usage?.output_tokens ?? 0;

            // Extract text
            const textBlock = response.content.find(b => b.type === "text");
            if (!textBlock || textBlock.type !== "text") {
                throw new AnthropicClientError(
                    "Claude returned no text content.",
                    "INVALID_RESPONSE"
                );
            }

            // Track cost
            trackClaudeUsage(model, options.operation, inputTokens, outputTokens, latencyMs);

            console.log(
                `[CLAUDE_OUTPUT] model=${model} | operation=${options.operation} | ` +
                `inputTokens=${inputTokens} | outputTokens=${outputTokens} | ` +
                `latencyMs=${latencyMs} | responseLength=${textBlock.text.length}`
            );

            return {
                text: textBlock.text,
                inputTokens,
                outputTokens,
                model,
                latencyMs
            };
        } catch (error: any) {
            if (error instanceof AnthropicClientError) throw error;

            const status = error?.status || 500;
            const isRetryable = [429, 500, 503, 529].includes(status) ||
                error.message?.includes("timeout");

            if (isRetryable && attempt < MAX_RETRIES) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
                console.warn(
                    `[CLAUDE_RETRY] attempt=${attempt}/${MAX_RETRIES} | ` +
                    `status=${status} | delay=${delay}ms | ` +
                    `error=${error.message?.slice(0, 100)}`
                );
                await sleep(delay);
                continue;
            }

            const latencyMs = Math.round(performance.now() - startTime);
            const code: AnthropicErrorCode =
                status === 429 ? "RATE_LIMITED" :
                status === 529 ? "OVERLOADED" :
                error.message?.includes("timeout") ? "TIMEOUT" :
                "SERVER_ERROR";

            console.error(
                `[CLAUDE_ERROR] model=${model} | operation=${options.operation} | ` +
                `code=${code} | status=${status} | latencyMs=${latencyMs} | ` +
                `error=${error.message?.slice(0, 200)}`
            );

            throw new AnthropicClientError(
                `Claude API failed after ${attempt} attempts: ${error.message}`,
                code,
                status
            );
        }
    }

    throw new AnthropicClientError("Maximum retries exceeded", "MAX_RETRIES_EXCEEDED");
}

// ─── Structured Output (Tool Use) ────────────────────────────────────────────

export interface GenerateStructuredOptions<T> extends Omit<GenerateTextOptions, "maxTokens"> {
    toolSchema: any;
    maxTokens?: number;
}

/**
 * Structured output via Claude tool use.
 * Returns a strongly-typed JSON payload extracted from the tool call.
 */
export async function generateStructured<T>(
    options: GenerateStructuredOptions<T>
): Promise<{ result: T; inputTokens: number; outputTokens: number; model: string; latencyMs: number }> {
    validatePrompt(options.prompt);

    const model = MODELS[options.tier];
    const maxTokens = options.maxTokens ?? 2000;
    const startTime = performance.now();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const client = getClient();
            const response = await client.messages.create({
                model,
                max_tokens: maxTokens,
                temperature: options.temperature ?? 0.0,
                system: options.systemPrompt,
                messages: [{ role: "user", content: options.prompt }],
                tools: [options.toolSchema],
                tool_choice: { type: "tool", name: options.toolSchema.name }
            });

            const latencyMs = Math.round(performance.now() - startTime);
            const inputTokens = response.usage?.input_tokens ?? 0;
            const outputTokens = response.usage?.output_tokens ?? 0;

            const toolBlock = response.content.find(b => b.type === "tool_use");
            if (!toolBlock || toolBlock.type !== "tool_use") {
                throw new AnthropicClientError(
                    "Claude did not return expected structured tool output.",
                    "INVALID_RESPONSE"
                );
            }

            trackClaudeUsage(model, options.operation, inputTokens, outputTokens, latencyMs);

            return {
                result: toolBlock.input as unknown as T,
                inputTokens,
                outputTokens,
                model,
                latencyMs
            };
        } catch (error: any) {
            if (error instanceof AnthropicClientError) throw error;

            const status = error?.status || 500;
            const isRetryable = [429, 500, 503, 529].includes(status);

            if (isRetryable && attempt < MAX_RETRIES) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
                await sleep(delay);
                continue;
            }

            throw new AnthropicClientError(
                `Claude structured call failed: ${error.message}`,
                "SERVER_ERROR",
                status
            );
        }
    }

    throw new AnthropicClientError("Maximum retries exceeded", "MAX_RETRIES_EXCEEDED");
}

// ─── Safety ───────────────────────────────────────────────────────────────────

function validatePrompt(prompt: string): void {
    if (!prompt || prompt.trim().length === 0) {
        throw new AnthropicClientError("Prompt is empty.", "INVALID_RESPONSE");
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
        throw new AnthropicClientError(
            `Prompt exceeds maximum length (${prompt.length} > ${MAX_PROMPT_LENGTH}).`,
            "PROMPT_TOO_LONG"
        );
    }

    // Never send API keys
    if (/sk-ant-/i.test(prompt)) {
        throw new AnthropicClientError(
            "SECURITY: Prompt contains what appears to be an API key.",
            "INVALID_RESPONSE"
        );
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
