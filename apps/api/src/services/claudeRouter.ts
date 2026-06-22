// ─── Claude Router ────────────────────────────────────────────────────────────
//
// Determines WHETHER and HOW Claude should be involved.
//
// CRITICAL RULE:
//   A ROOT_CAUSE query does NOT automatically call Claude.
//   Claude is optional — activated only when user explicitly asks for
//   narrative, executive summary, explanation, or recommendations.
//
// Tiers:
//   NONE   → Deterministic only. Claude never called.
//   HAIKU  → Lightweight: Executive Summary, Narrative, Explain Results.
//   SONNET → Heavy: Recommendations, Strategic Analysis, Risk Analysis.
// ───────────────────────────────────────────────────────────────────────────────

export type ClaudeTier = "NONE" | "HAIKU" | "SONNET";

export type ClaudeOperation =
    | "EXECUTIVE_SUMMARY"
    | "NARRATIVE_GENERATION"
    | "EXPLAIN_RESULTS"
    | "TREND_EXPLANATION"
    | "RECOMMENDATIONS"
    | "STRATEGIC_ANALYSIS"
    | "OPPORTUNITY_DISCOVERY"
    | "RISK_ANALYSIS";

export interface ClaudeRouterDecision {
    shouldCallClaude: boolean;
    tier: ClaudeTier;
    operation: ClaudeOperation | null;
    reason: string;
    maxTokens: number;
}

// ─── Tier Assignments ─────────────────────────────────────────────────────────

/** Routes that are fully deterministic — Claude NEVER called */
const DETERMINISTIC_ROUTES = new Set([
    "TEMPLATE", "TREND", "COMPARISON", "CONTRIBUTION", "CACHE"
]);

const HAIKU_OPS = new Set<ClaudeOperation>([
    "EXECUTIVE_SUMMARY",
    "NARRATIVE_GENERATION",
    "EXPLAIN_RESULTS",
    "TREND_EXPLANATION"
]);

const SONNET_OPS = new Set<ClaudeOperation>([
    "RECOMMENDATIONS",
    "STRATEGIC_ANALYSIS",
    "OPPORTUNITY_DISCOVERY",
    "RISK_ANALYSIS"
]);

const TOKEN_BUDGETS: Record<ClaudeOperation, number> = {
    EXECUTIVE_SUMMARY:      800,
    NARRATIVE_GENERATION:   1200,
    EXPLAIN_RESULTS:        600,
    TREND_EXPLANATION:      600,
    RECOMMENDATIONS:        1500,
    STRATEGIC_ANALYSIS:     1500,
    OPPORTUNITY_DISCOVERY:  1200,
    RISK_ANALYSIS:          1200
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Quick check: should Claude be considered for this analytics route?
 * Returns false for all deterministic routes AND for ROOT_CAUSE
 * (ROOT_CAUSE alone = just return the pack).
 */
export function shouldUseClaude(analyticsRoute: string): boolean {
    // ROOT_CAUSE by itself does NOT trigger Claude.
    // It only triggers Claude when a specific operation is requested.
    if (analyticsRoute === "ROOT_CAUSE") return false;
    return !DETERMINISTIC_ROUTES.has(analyticsRoute);
}

/**
 * Full routing decision.
 *
 * @param analyticsRoute - The deterministic route (TEMPLATE, ROOT_CAUSE, etc.)
 * @param operation - The specific Claude operation requested (null = no Claude)
 * @param hasValidPack - Whether a validated analytics pack exists
 */
export function routeClaude(
    analyticsRoute: string,
    operation: ClaudeOperation | null,
    hasValidPack: boolean = false
): ClaudeRouterDecision {

    // 1. No operation requested → no Claude
    if (!operation) {
        return decide("NONE", null, 0, `No Claude operation requested. Route "${analyticsRoute}" is fully deterministic.`);
    }

    // 2. Deterministic routes → no Claude, regardless of operation
    if (DETERMINISTIC_ROUTES.has(analyticsRoute)) {
        return decide("NONE", null, 0, `Route "${analyticsRoute}" is deterministic. Claude blocked.`);
    }

    // 3. ROOT_CAUSE or COMPETITOR_STRATEGY with an operation and a valid pack → route to appropriate tier
    if ((analyticsRoute === "ROOT_CAUSE" || analyticsRoute === "COMPETITOR_STRATEGY") && hasValidPack) {
        const tier = selectClaudeTier(operation);
        return decide(tier, operation, TOKEN_BUDGETS[operation] ?? 1000, `${analyticsRoute} + ${operation} → ${tier}`);
    }

    // 4. ROOT_CAUSE / COMPETITOR_STRATEGY without a valid pack → no Claude
    if ((analyticsRoute === "ROOT_CAUSE" || analyticsRoute === "COMPETITOR_STRATEGY") && !hasValidPack) {
        return decide("NONE", null, 0, `${analyticsRoute} but no valid pack available. Claude skipped.`);
    }

    // 5. LLM fallback or other → use Sonnet
    if (analyticsRoute === "LLM") {
        return decide("SONNET", operation, TOKEN_BUDGETS[operation] ?? 1500, `LLM fallback → SONNET for ${operation}`);
    }

    // 6. Default
    return decide("NONE", null, 0, "No matching Claude route.");
}

/**
 * Given an operation, returns the appropriate tier.
 */
export function selectClaudeTier(operation: ClaudeOperation): ClaudeTier {
    if (HAIKU_OPS.has(operation)) return "HAIKU";
    if (SONNET_OPS.has(operation)) return "SONNET";
    return "NONE";
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function decide(
    tier: ClaudeTier,
    operation: ClaudeOperation | null,
    maxTokens: number,
    reason: string
): ClaudeRouterDecision {
    const decision: ClaudeRouterDecision = {
        shouldCallClaude: tier !== "NONE",
        tier,
        operation,
        reason,
        maxTokens
    };

    console.log(
        `[CLAUDE_ROUTER] shouldCall=${decision.shouldCallClaude} | tier=${tier} | ` +
        `op=${operation ?? "none"} | maxTokens=${maxTokens} | reason=${reason}`
    );

    return decision;
}
