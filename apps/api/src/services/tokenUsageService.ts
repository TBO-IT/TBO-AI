import { prisma } from "../lib/prisma.js";

// Claude 3.5 Sonnet token costs per 1k (as of early 2024/2025)
// Assuming prompt: $3 / 1M, output: $15 / 1M
const COST_PER_1K_INPUT = 0.003;
const COST_PER_1K_OUTPUT = 0.015;

export async function recordUsage(
    model: string,
    requestType: "SQL_GENERATION" | "NARRATIVE_GENERATION" | "INSIGHT_EXTRACTION",
    inputTokens: number,
    outputTokens: number
) {
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
        console.log(`[TokenTracker] Recorded ${inputTokens} in / ${outputTokens} out for ${requestType} ($${estimatedCost.toFixed(4)})`);
    } catch (error) {
        console.error("[TokenTracker] Failed to record usage:", error);
    }
}
