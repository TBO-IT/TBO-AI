// ─── Claude Cost Tracker ──────────────────────────────────────────────────────
//
// Tracks per-call and aggregated Claude API costs.
// Provides daily, weekly, monthly cost summaries.
// Logs every call with [CLAUDE_USAGE] tags.
// ───────────────────────────────────────────────────────────────────────────────

// Pricing per 1M tokens (as of 2024/2025)
const PRICING: Record<string, { input: number; output: number }> = {
    "claude-3-5-sonnet-20241022": { input: 3.00, output: 15.00 },
    "claude-3-5-haiku-20241022":  { input: 0.25, output: 1.25 },
    // Fallback for unknown models
    "default":                    { input: 3.00, output: 15.00 }
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClaudeUsageEntry {
    timestamp: number;
    model: string;
    operation: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    latencyMs: number;
}

interface CostSummary {
    totalCostUsd: number;
    callCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    avgLatencyMs: number;
    period: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

const usageLog: ClaudeUsageEntry[] = [];
const MAX_LOG_SIZE = 50_000;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Records a single Claude API call.
 * Called by the anthropicClient after every successful request.
 */
export function trackClaudeUsage(
    model: string,
    operation: string,
    inputTokens: number,
    outputTokens: number,
    latencyMs: number
): void {
    const pricing = PRICING[model] ?? PRICING["default"];
    const costUsd =
        (inputTokens / 1_000_000) * pricing.input +
        (outputTokens / 1_000_000) * pricing.output;

    const entry: ClaudeUsageEntry = {
        timestamp: Date.now(),
        model,
        operation,
        inputTokens,
        outputTokens,
        costUsd,
        latencyMs
    };

    usageLog.push(entry);

    // Prevent unbounded memory growth
    if (usageLog.length > MAX_LOG_SIZE) {
        usageLog.splice(0, usageLog.length - MAX_LOG_SIZE);
    }

    console.log(
        `[CLAUDE_USAGE] model=${model} | op=${operation} | ` +
        `in=${inputTokens} | out=${outputTokens} | ` +
        `cost=$${costUsd.toFixed(4)} | latency=${latencyMs}ms`
    );
}

/**
 * Returns cost summary for the last N milliseconds.
 */
function summarizePeriod(periodMs: number, label: string): CostSummary {
    const cutoff = Date.now() - periodMs;
    const entries = usageLog.filter(e => e.timestamp >= cutoff);

    const totalCostUsd = entries.reduce((s, e) => s + e.costUsd, 0);
    const totalInputTokens = entries.reduce((s, e) => s + e.inputTokens, 0);
    const totalOutputTokens = entries.reduce((s, e) => s + e.outputTokens, 0);
    const avgLatencyMs = entries.length > 0
        ? entries.reduce((s, e) => s + e.latencyMs, 0) / entries.length
        : 0;

    return {
        totalCostUsd: +totalCostUsd.toFixed(4),
        callCount: entries.length,
        totalInputTokens,
        totalOutputTokens,
        avgLatencyMs: Math.round(avgLatencyMs),
        period: label
    };
}

const MS_HOUR  = 60 * 60 * 1000;
const MS_DAY   = 24 * MS_HOUR;
const MS_WEEK  = 7 * MS_DAY;
const MS_MONTH = 30 * MS_DAY;

/** Cost summary for the last 24 hours */
export function getDailyCost(): CostSummary {
    return summarizePeriod(MS_DAY, "daily");
}

/** Cost summary for the last 7 days */
export function getWeeklyCost(): CostSummary {
    return summarizePeriod(MS_WEEK, "weekly");
}

/** Cost summary for the last 30 days */
export function getMonthlyCost(): CostSummary {
    return summarizePeriod(MS_MONTH, "monthly");
}

/** Full cost dashboard snapshot */
export function getCostDashboard(): {
    daily: CostSummary;
    weekly: CostSummary;
    monthly: CostSummary;
    recentCalls: ClaudeUsageEntry[];
    modelBreakdown: Record<string, { calls: number; cost: number }>;
    operationBreakdown: Record<string, { calls: number; cost: number }>;
} {
    const daily = getDailyCost();
    const weekly = getWeeklyCost();
    const monthly = getMonthlyCost();

    // Last 20 calls
    const recentCalls = usageLog.slice(-20).reverse();

    // Model breakdown
    const modelBreakdown: Record<string, { calls: number; cost: number }> = {};
    for (const e of usageLog) {
        if (!modelBreakdown[e.model]) {
            modelBreakdown[e.model] = { calls: 0, cost: 0 };
        }
        modelBreakdown[e.model].calls++;
        modelBreakdown[e.model].cost += e.costUsd;
    }

    // Operation breakdown
    const operationBreakdown: Record<string, { calls: number; cost: number }> = {};
    for (const e of usageLog) {
        if (!operationBreakdown[e.operation]) {
            operationBreakdown[e.operation] = { calls: 0, cost: 0 };
        }
        operationBreakdown[e.operation].calls++;
        operationBreakdown[e.operation].cost += e.costUsd;
    }

    // Round costs
    for (const v of Object.values(modelBreakdown)) v.cost = +v.cost.toFixed(4);
    for (const v of Object.values(operationBreakdown)) v.cost = +v.cost.toFixed(4);

    return { daily, weekly, monthly, recentCalls, modelBreakdown, operationBreakdown };
}

/**
 * Returns a cost estimate for a hypothetical call (pre-call budgeting).
 */
export function estimateCost(
    model: string,
    estimatedInputTokens: number,
    estimatedOutputTokens: number
): { costUsd: number; formatted: string } {
    const pricing = PRICING[model] ?? PRICING["default"];
    const costUsd =
        (estimatedInputTokens / 1_000_000) * pricing.input +
        (estimatedOutputTokens / 1_000_000) * pricing.output;

    return {
        costUsd: +costUsd.toFixed(6),
        formatted: `$${costUsd.toFixed(4)} (${estimatedInputTokens} in / ${estimatedOutputTokens} out)`
    };
}

/** Resets all tracked usage (for testing) */
export function resetUsageLog(): void {
    usageLog.length = 0;
}
