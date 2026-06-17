// ─── Claude Router ────────────────────────────────────────────────────────────
//
// Tier-based routing that determines whether and how Claude should be involved.
//
// Tiers:
//   NONE   — Fully deterministic. Claude is never called.
//   HAIKU  — Lightweight narrative tasks (summaries, explanations).
//   SONNET — Heavy analytical tasks (recommendations, strategy, open-ended).
//
// The analytics pipeline ALWAYS runs first. Claude only adds narrative polish.
// ───────────────────────────────────────────────────────────────────────────────

export type ClaudeTier = "NONE" | "HAIKU" | "SONNET";

export type ClaudeOperation =
    | "EXECUTIVE_SUMMARY"
    | "EXPLAIN_RESULTS"
    | "NARRATIVE_GENERATION"
    | "TREND_EXPLANATION"
    | "RECOMMENDATIONS"
    | "STRATEGIC_ANALYSIS"
    | "OPPORTUNITY_DISCOVERY"
    | "RISK_ANALYSIS"
    | "AD_HOC_REASONING";

export interface ClaudeRouterDecision {
    /** Whether Claude should be called */
    shouldCallClaude: boolean;

    /** Which Claude tier to use */
    tier: ClaudeTier;

    /** The specific operation type */
    operation: ClaudeOperation | null;

    /** Model identifier for the selected tier */
    model: string;

    /** Human-readable reason for the routing decision */
    reason: string;

    /** Estimated max output tokens for this operation */
    maxTokens: number;
}

// ─── Model Configuration ──────────────────────────────────────────────────────

const MODELS: Record<Exclude<ClaudeTier, "NONE">, string> = {
    HAIKU:  "claude-3-5-haiku-20241022",
    SONNET: "claude-3-5-sonnet-20241022"
};

// ─── Tier Routing Rules ───────────────────────────────────────────────────────

/** Routes that are fully deterministic — NEVER call Claude */
const NONE_ROUTES = new Set([
    "TEMPLATE",
    "TREND",
    "COMPARISON",
    "CONTRIBUTION",
    "CACHE"
]);

/** Operations that use the lightweight Haiku model */
const HAIKU_OPERATIONS = new Set<ClaudeOperation>([
    "EXECUTIVE_SUMMARY",
    "EXPLAIN_RESULTS",
    "NARRATIVE_GENERATION",
    "TREND_EXPLANATION"
]);

/** Operations that require the full Sonnet model */
const SONNET_OPERATIONS = new Set<ClaudeOperation>([
    "RECOMMENDATIONS",
    "STRATEGIC_ANALYSIS",
    "OPPORTUNITY_DISCOVERY",
    "RISK_ANALYSIS",
    "AD_HOC_REASONING"
]);

// ─── Token Budgets ────────────────────────────────────────────────────────────

const TOKEN_BUDGETS: Record<ClaudeOperation, number> = {
    EXECUTIVE_SUMMARY:    800,
    EXPLAIN_RESULTS:      600,
    NARRATIVE_GENERATION: 1200,
    TREND_EXPLANATION:    600,
    RECOMMENDATIONS:      1500,
    STRATEGIC_ANALYSIS:   1500,
    OPPORTUNITY_DISCOVERY: 1200,
    RISK_ANALYSIS:        1200,
    AD_HOC_REASONING:     2000
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Determines whether Claude should be called and at which tier.
 * 
 * @param analyticsRoute - The deterministic route that was used (TEMPLATE, TREND, ROOT_CAUSE, etc.)
 * @param operation - The specific Claude operation being requested
 * @param hasRootCausePack - Whether a validated RootCausePack exists
 */
export function routeClaude(
    analyticsRoute: string,
    operation: ClaudeOperation | null,
    hasRootCausePack: boolean = false
): ClaudeRouterDecision {
    // 1. Deterministic routes never call Claude for core analytics
    if (NONE_ROUTES.has(analyticsRoute) && !operation) {
        const decision: ClaudeRouterDecision = {
            shouldCallClaude: false,
            tier: "NONE",
            operation: null,
            model: "",
            reason: `Route "${analyticsRoute}" is fully deterministic. Claude is not needed.`,
            maxTokens: 0
        };
        logDecision(decision);
        return decision;
    }

    // 2. ROOT_CAUSE with a pack can use Claude for narrative enrichment
    if (analyticsRoute === "ROOT_CAUSE" && hasRootCausePack && operation) {
        const tier = selectTier(operation);
        const decision: ClaudeRouterDecision = {
            shouldCallClaude: true,
            tier,
            operation,
            model: tier === "NONE" ? "" : MODELS[tier],
            reason: `ROOT_CAUSE pack available. Using ${tier} for ${operation}.`,
            maxTokens: TOKEN_BUDGETS[operation] ?? 1000
        };
        logDecision(decision);
        return decision;
    }

    // 3. LLM fallback route — always use Sonnet for SQL generation
    if (analyticsRoute === "LLM") {
        const decision: ClaudeRouterDecision = {
            shouldCallClaude: true,
            tier: "SONNET",
            operation: operation ?? "AD_HOC_REASONING",
            model: MODELS.SONNET,
            reason: `LLM fallback route. Using SONNET for ad-hoc reasoning.`,
            maxTokens: TOKEN_BUDGETS.AD_HOC_REASONING
        };
        logDecision(decision);
        return decision;
    }

    // 4. Explicit operation request with no special route
    if (operation) {
        const tier = selectTier(operation);
        const decision: ClaudeRouterDecision = {
            shouldCallClaude: tier !== "NONE",
            tier,
            operation,
            model: tier === "NONE" ? "" : MODELS[tier],
            reason: `Explicit operation ${operation}. Assigned to ${tier}.`,
            maxTokens: TOKEN_BUDGETS[operation] ?? 1000
        };
        logDecision(decision);
        return decision;
    }

    // 5. Default: no Claude
    const decision: ClaudeRouterDecision = {
        shouldCallClaude: false,
        tier: "NONE",
        operation: null,
        model: "",
        reason: "No Claude operation requested. Using deterministic pipeline.",
        maxTokens: 0
    };
    logDecision(decision);
    return decision;
}

/**
 * Quick check: should Claude be invoked at all for this route?
 */
export function shouldUseClaude(analyticsRoute: string): boolean {
    return !NONE_ROUTES.has(analyticsRoute);
}

/**
 * Selects the appropriate tier for a given operation.
 */
export function selectClaudeTier(operation: ClaudeOperation): ClaudeTier {
    return selectTier(operation);
}

/**
 * Returns the model identifier for a given tier.
 */
export function getModelForTier(tier: Exclude<ClaudeTier, "NONE">): string {
    return MODELS[tier];
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function selectTier(operation: ClaudeOperation): ClaudeTier {
    if (HAIKU_OPERATIONS.has(operation)) return "HAIKU";
    if (SONNET_OPERATIONS.has(operation)) return "SONNET";
    return "NONE";
}

function logDecision(decision: ClaudeRouterDecision): void {
    console.log(
        `[CLAUDE_ROUTER] shouldCall=${decision.shouldCallClaude} | ` +
        `tier=${decision.tier} | ` +
        `operation=${decision.operation ?? "none"} | ` +
        `model=${decision.model || "n/a"} | ` +
        `maxTokens=${decision.maxTokens} | ` +
        `reason=${decision.reason}`
    );
}
