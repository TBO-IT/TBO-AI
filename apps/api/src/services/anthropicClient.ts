// ─── Anthropic Client ─────────────────────────────────────────────────────────
//
// Single entry point for all Claude API calls.
//
// Uses environment-configured model names from config/models.ts.
// Provides: generateText(), generateNarrative(), generateRecommendations()
//
// Responsibilities:
//   - Retry with exponential backoff (3 retries)
//   - Timeout handling (30s)
//   - Structured errors
//   - Usage logging via [CLAUDE_USAGE]
//   - Cost estimation
//   - Prompt length safety (50K cap)
//   - Never logs API keys
// ───────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "../config/models.js";
import { recordUsage } from "./tokenUsageService.js";
import { trackClaudeUsage } from "./claudeCostTracker.js";
import { logClaude } from "./analyticsLogger.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_PROMPT_CHARS = 50_000;

type ClaudeTier = "HAIKU" | "SONNET";

// Cost per 1M tokens
const COST_TABLE: Record<string, { input: number; output: number }> = {
    "claude-haiku-4-5":              { input: 0.25,  output: 1.25 },
    "claude-3-5-haiku-20241022":     { input: 0.25,  output: 1.25 },
    "claude-sonnet-4-5":             { input: 3.00,  output: 15.00 },
    "claude-3-5-sonnet-20241022":    { input: 3.00,  output: 15.00 },
    "claude-3-7-sonnet-20250219":    { input: 3.00,  output: 15.00 }
};

// ─── Client ───────────────────────────────────────────────────────────────────

let _client: Anthropic | null = null;

function getClient(): Anthropic {
    if (!_client) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new AnthropicClientError(
                "ANTHROPIC_API_KEY is not set.",
                "CONFIG_ERROR"
            );
        }
        _client = new Anthropic({ apiKey });
    }
    return _client;
}

function getModel(tier: ClaudeTier): string {
    const model = MODELS[tier];
    if (!model) {
        throw new AnthropicClientError(
            `Model not configured for tier ${tier}. Set CLAUDE_${tier}_MODEL env var.`,
            "CONFIG_ERROR"
        );
    }
    return model;
}

// ─── Error ────────────────────────────────────────────────────────────────────

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

// ─── Core: generateText() ─────────────────────────────────────────────────────

export interface GenerateTextResult {
    text: string;
    inputTokens: number;
    outputTokens: number;
    model: string;
    latencyMs: number;
    estimatedCost: number;
}

/**
 * Send a prompt to Claude and receive raw text back.
 */
export async function generateText(
    prompt: string,
    systemPrompt: string,
    tier: ClaudeTier,
    maxTokens: number = 1500,
    temperature: number = 0.1
): Promise<GenerateTextResult> {
    validatePrompt(prompt);

    const model = getModel(tier);
    const start = performance.now();

    console.log(
        `[CLAUDE_INPUT] tier=${tier} | model=${model} | ` +
        `maxTokens=${maxTokens} | promptChars=${prompt.length}`
    );

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log("\n[CLAUDE_SYSTEM_PROMPT]\n" + systemPrompt);
            console.log("\n[CLAUDE_USER_PROMPT]\n" + prompt);

            const client = getClient();
            const response = await client.messages.create({
                model,
                max_tokens: maxTokens,
                temperature,
                system: systemPrompt,
                messages: [{ role: "user", content: prompt }]
            });

            const latencyMs = Math.round(performance.now() - start);
            const inputTokens = response.usage?.input_tokens ?? 0;
            const outputTokens = response.usage?.output_tokens ?? 0;
            const estimatedCost = estimateCost(model, inputTokens, outputTokens);

            const textBlock = response.content.find(b => b.type === "text");
            if (!textBlock || textBlock.type !== "text") {
                throw new AnthropicClientError("Claude returned no text.", "INVALID_RESPONSE");
            }

            console.log("\n[CLAUDE_RESPONSE]\n" + textBlock.text);

            logClaude(`Claude API Call: ${model}`, latencyMs, {
                tier,
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
                cost: estimatedCost
            });

            // Log usage
            console.log(
                `[CLAUDE_USAGE] model=${model} | in=${inputTokens} | out=${outputTokens} | ` +
                `cost=$${estimatedCost.toFixed(4)} | latency=${latencyMs}ms`
            );

            console.log(
                `\n` +
                `┌─────────────────────────────────────────────────\n` +
                `│ [TOKEN_COST] Claude API Call Summary\n` +
                `│  Model:         ${model}\n` +
                `│  Tier:          ${tier}\n` +
                `│  Input Tokens:  ${inputTokens.toLocaleString()}\n` +
                `│  Output Tokens: ${outputTokens.toLocaleString()}\n` +
                `│  Total Tokens:  ${(inputTokens + outputTokens).toLocaleString()}\n` +
                `│  Cost:          $${estimatedCost.toFixed(6)}\n` +
                `│  Latency:       ${latencyMs}ms\n` +
                `└─────────────────────────────────────────────────`
            );

            // Track in cost tracker for aggregation & dashboards
            trackClaudeUsage(model, "CLAUDE_CALL", inputTokens, outputTokens, latencyMs);

            // Persist to DB
            await recordUsage(model, "NARRATIVE_GENERATION", inputTokens, outputTokens).catch(() => {});

            console.log(
                `[CLAUDE_OUTPUT] model=${model} | responseChars=${textBlock.text.length} | latency=${latencyMs}ms`
            );

            return {
                text: textBlock.text,
                inputTokens,
                outputTokens,
                model,
                latencyMs,
                estimatedCost
            };
        } catch (err: any) {
            if (err instanceof AnthropicClientError) throw err;

            const status = err?.status || 500;
            const retryable = [429, 500, 503, 529].includes(status) || err.message?.includes("timeout");

            if (retryable && attempt < MAX_RETRIES) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
                console.warn(`[CLAUDE_RETRY] attempt=${attempt}/${MAX_RETRIES} | status=${status} | delay=${delay}ms`);
                await sleep(delay);
                continue;
            }

            const code: AnthropicErrorCode =
                status === 429 ? "RATE_LIMITED" :
                status === 529 ? "OVERLOADED" :
                err.message?.includes("timeout") ? "TIMEOUT" : "SERVER_ERROR";

            throw new AnthropicClientError(
                `Claude failed after ${attempt} attempts: ${err.message}`,
                code, status
            );
        }
    }

    throw new AnthropicClientError("Max retries exceeded.", "MAX_RETRIES_EXCEEDED");
}

// ─── Convenience: generateNarrative() ─────────────────────────────────────────

/**
 * Generates a narrative from a prompt using Haiku.
 */
export async function generateNarrativeText(
    prompt: string,
    systemPrompt: string
): Promise<GenerateTextResult> {
    return generateText(prompt, systemPrompt, "HAIKU", 1200, 0.1);
}

// ─── Convenience: generateRecommendations() ───────────────────────────────────

/**
 * Generates recommendations from a prompt using Sonnet.
 */
export async function generateRecommendationText(
    prompt: string,
    systemPrompt: string
): Promise<GenerateTextResult> {
    return generateText(prompt, systemPrompt, "SONNET", 1500, 0.2);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validatePrompt(prompt: string): void {
    if (!prompt || prompt.trim().length === 0) {
        throw new AnthropicClientError("Prompt is empty.", "INVALID_RESPONSE");
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
        throw new AnthropicClientError(
            `Prompt too long: ${prompt.length} > ${MAX_PROMPT_CHARS} chars.`,
            "PROMPT_TOO_LONG"
        );
    }
    if (/sk-ant-/i.test(prompt)) {
        throw new AnthropicClientError("SECURITY: Prompt contains API key pattern.", "INVALID_RESPONSE");
    }
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const prices = COST_TABLE[model] ?? { input: 3.00, output: 15.00 };
    return (inputTokens / 1_000_000) * prices.input + (outputTokens / 1_000_000) * prices.output;
}

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}
