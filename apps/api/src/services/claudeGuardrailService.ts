// ─── Claude Guardrail Service ─────────────────────────────────────────────────
//
// Cost control layer that strictly limits which operations are allowed to call Claude.
// Deterministic routes (TEMPLATE, TREND, COMPARISON, CONTRIBUTION) NEVER touch Claude.
// Only high-value analytical tasks justify LLM spend.
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Operations that are ALLOWED to call Claude.
 * Everything else is blocked.
 */
const CLAUDE_ALLOWED_OPERATIONS = new Set([
    "ROOT_CAUSE_NARRATIVE",
    "EXECUTIVE_SUMMARY",
    "RECOMMENDATIONS",
    "AD_HOC_REASONING"
]);

/**
 * Routes that must NEVER call Claude for SQL generation or narrative.
 * These are fully deterministic and handled by the engine layer.
 */
const DETERMINISTIC_ROUTES = new Set([
    "TEMPLATE",
    "TREND",
    "COMPARISON",
    "CONTRIBUTION",
    "ROOT_CAUSE",
    "CACHE"
]);

// Claude 3.5 Sonnet pricing (per 1M tokens)
const COST_PER_1M_INPUT = 3.00;
const COST_PER_1M_OUTPUT = 15.00;

// Session-level cost tracking
let sessionTotalCost = 0;
let sessionCallCount = 0;

export interface GuardrailDecision {
    allowed: boolean;
    reason: string;
    estimatedCostUsd?: number;
}

/**
 * Checks whether a given operation is allowed to call Claude.
 * Returns a decision with an explanation.
 */
export function checkClaudeAllowed(
    operation: string,
    routeType: string
): GuardrailDecision {

    // Block deterministic routes from calling Claude for SQL generation
    if (DETERMINISTIC_ROUTES.has(routeType) && operation === "SQL_GENERATION") {
        return {
            allowed: false,
            reason: `[GUARDRAIL] BLOCKED: Route "${routeType}" is deterministic. Claude SQL generation is not permitted.`
        };
    }

    // Block deterministic routes from calling Claude for narrative (except ROOT_CAUSE)
    if (DETERMINISTIC_ROUTES.has(routeType) && operation === "NARRATIVE_GENERATION" && routeType !== "ROOT_CAUSE") {
        return {
            allowed: false,
            reason: `[GUARDRAIL] BLOCKED: Route "${routeType}" uses deterministic narrative. Claude narrative is not permitted.`
        };
    }

    // Allow whitelisted operations
    if (CLAUDE_ALLOWED_OPERATIONS.has(operation)) {
        return {
            allowed: true,
            reason: `[GUARDRAIL] ALLOWED: Operation "${operation}" is in the Claude whitelist.`
        };
    }

    // Allow LLM fallback for SQL generation (ad-hoc queries)
    if (operation === "SQL_GENERATION" && routeType === "LLM") {
        return {
            allowed: true,
            reason: `[GUARDRAIL] ALLOWED: LLM fallback SQL generation for ad-hoc query.`
        };
    }

    // Allow narrative generation for LLM route
    if (operation === "NARRATIVE_GENERATION" && routeType === "LLM") {
        return {
            allowed: true,
            reason: `[GUARDRAIL] ALLOWED: LLM narrative generation for ad-hoc query.`
        };
    }

    // Default: block
    return {
        allowed: false,
        reason: `[GUARDRAIL] BLOCKED: Operation "${operation}" with route "${routeType}" is not in the whitelist.`
    };
}

/**
 * Estimates the cost of a Claude API call before it happens.
 * Used for logging and budget enforcement.
 */
export function estimateClaudeCost(
    estimatedInputTokens: number,
    estimatedOutputTokens: number
): { estimatedCostUsd: number; formatted: string } {
    const inputCost = (estimatedInputTokens / 1_000_000) * COST_PER_1M_INPUT;
    const outputCost = (estimatedOutputTokens / 1_000_000) * COST_PER_1M_OUTPUT;
    const total = inputCost + outputCost;

    return {
        estimatedCostUsd: total,
        formatted: `$${total.toFixed(4)} (in: ${estimatedInputTokens} tokens, out: ${estimatedOutputTokens} tokens)`
    };
}

/**
 * Records a completed Claude call for session cost tracking.
 */
export function recordClaudeCost(inputTokens: number, outputTokens: number): void {
    const { estimatedCostUsd } = estimateClaudeCost(inputTokens, outputTokens);
    sessionTotalCost += estimatedCostUsd;
    sessionCallCount++;

    console.log(
        `[GUARDRAIL] Claude call #${sessionCallCount} cost: $${estimatedCostUsd.toFixed(4)} | ` +
        `Session total: $${sessionTotalCost.toFixed(4)}`
    );
}

/**
 * Returns current session cost summary.
 */
export function getSessionCostSummary(): {
    totalCostUsd: number;
    callCount: number;
    formatted: string;
} {
    return {
        totalCostUsd: sessionTotalCost,
        callCount: sessionCallCount,
        formatted: `${sessionCallCount} calls | $${sessionTotalCost.toFixed(4)} total`
    };
}

/**
 * Resets session tracking (useful for testing).
 */
export function resetSessionCost(): void {
    sessionTotalCost = 0;
    sessionCallCount = 0;
}
