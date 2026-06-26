import { getAnthropicClient } from "../lib/claude.js";
import { MODELS } from "../config/models.js";
import { recordUsage } from "./tokenUsageService.js";
import { logger } from "../lib/logger.js";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export class AnthropicAPIError extends Error {
    constructor(message: string, public readonly status?: number) {
        super(message);
        this.name = "AnthropicAPIError";
    }
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Robust wrapper around Claude API with exponential backoff, retry logic,
 * and automatic structured output extraction.
 */
export async function callClaudeWithStructuredOutput<T>(
    prompt: string,
    toolSchema: any,
    requestType: "SQL_GENERATION" | "NARRATIVE_GENERATION" | "INSIGHT_EXTRACTION",
    systemPrompt: string = "You are an Executive Analytics Copilot.",
    temperature: number = 0.0
): Promise<T> {
    const model = MODELS.SONNET || "claude-sonnet-4-5";
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await getAnthropicClient().messages.create({
                model,
                max_tokens: 2000,
                temperature,
                system: systemPrompt,
                messages: [{ role: "user", content: prompt }],
                tools: [toolSchema],
                tool_choice: { type: "tool", name: toolSchema.name }
            });

            // Track usage
            if (response.usage) {
                await recordUsage(
                    model,
                    requestType,
                    response.usage.input_tokens,
                    response.usage.output_tokens
                );
            }

            // Extract the structured tool use
            const toolBlock = response.content.find(block => block.type === "tool_use");
            if (!toolBlock || toolBlock.type !== "tool_use") {
                throw new Error("Claude did not return the expected structured tool output.");
            }

            // Return the strongly typed JSON payload
            return toolBlock.input as unknown as T;

        } catch (error: any) {
            const status = error?.status || 500;
            
            // Retryable errors: 429 Too Many Requests, 529 Overloaded, 500 Internal, 503 Service Unavailable
            const isRetryable = [429, 500, 503, 529].includes(status) || error.message.includes("timeout");
            
            if (isRetryable && attempt < MAX_RETRIES) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
                logger.warn({ status, delay, attempt, maxRetries: MAX_RETRIES }, "Anthropic API error; retrying");
                await sleep(delay);
                continue;
            }

            logger.error({ err: error, status, attempt }, "Anthropic API fatal error");
            throw new AnthropicAPIError(error.message, status);
        }
    }

    throw new Error("Maximum retries exceeded");
}
