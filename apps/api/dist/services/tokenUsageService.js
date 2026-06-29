import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
// Claude 3.5 Sonnet token costs per 1k (as of early 2024/2025)
// Assuming prompt: $3 / 1M, output: $15 / 1M
const COST_PER_1K_INPUT = 0.003;
const COST_PER_1K_OUTPUT = 0.015;
export async function recordUsage(model, requestType, inputTokens, outputTokens) {
    // Only calculate cost for Claude models (simplified calculation)
    let estimatedCost = 0;
    if (model.includes("claude")) {
        estimatedCost = (inputTokens / 1000) * COST_PER_1K_INPUT + (outputTokens / 1000) * COST_PER_1K_OUTPUT;
    }
    try {
        await prisma.lLMUsage.create({
            data: {
                model,
                requestType,
                inputTokens,
                outputTokens,
                estimatedCost
            }
        });
        logger.info({ model, requestType, inputTokens, outputTokens, estimatedCost }, "Token usage recorded");
    }
    catch (error) {
        logger.error({ err: error, model, requestType }, "Token usage record failed");
    }
}
