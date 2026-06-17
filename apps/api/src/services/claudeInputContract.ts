import { RootCausePack, ContributorEntry, MetricChange } from "./RootCausePackBuilder.js";

// ─── Claude Input Contract ────────────────────────────────────────────────────
//
// This module defines the ONLY data structure that Claude is permitted to receive.
// It acts as a strict firewall between raw analytics data and the LLM layer.
//
// NEVER expose: raw SQL, raw rows, raw datasets, file paths, column names.
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Sanitized contributor summary for Claude consumption.
 * Contains only business-meaningful fields — no internal IDs or raw column references.
 */
export interface ClaudeContributorSummary {
    name: string;
    metricValue: number;
    volume: number;
    volumeSharePct: number;
    metricDelta: number;
    weightedContribution: number;
    contributionPct: number;
}

/**
 * The ONLY structure Claude is allowed to consume.
 * Built from validated analytics packs — never from raw query results.
 */
export interface ClaudeInputPack {
    /** The user's original question */
    question: string;

    /** The canonical metric being analyzed */
    metricName: string;

    /** Overall metric change between periods (null for single-period analysis) */
    metricChange: MetricChange | null;

    /** Top entities that pulled the metric UP */
    topPositiveContributors: ClaudeContributorSummary[];

    /** Top entities that pulled the metric DOWN */
    topNegativeContributors: ClaudeContributorSummary[];

    /** Dimension-specific breakdowns */
    affectedHotels: ClaudeContributorSummary[];
    affectedChains: ClaudeContributorSummary[];
    affectedSuppliers: ClaudeContributorSummary[];
    affectedAPWBuckets: ClaudeContributorSummary[];

    /** Trend data points (if available) */
    trendSummary: { period: string; value: number }[];

    /** Whether the user's stated expectation contradicts the data */
    contradictionDetected: boolean;

    /** What direction the user expected (e.g. "decline") */
    expectedDirection?: string;

    /** Validation status from the analytics engine */
    validationStatus: "PASSED" | "FAILED" | "UNKNOWN";

    /** Validation errors (if any) */
    validationErrors: string[];

    /** Total rows analyzed */
    totalRows: number;

    /** Timestamp of pack generation */
    builtAt: string;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Converts a ContributorEntry to a Claude-safe summary.
 * Strips any internal fields and enforces finite numbers.
 */
function sanitizeContributor(entry: ContributorEntry): ClaudeContributorSummary {
    return {
        name:                 entry.name,
        metricValue:          safeNum(entry.metricValue),
        volume:               safeNum(entry.volume),
        volumeSharePct:       safeNum(entry.volumeSharePct),
        metricDelta:          safeNum(entry.metricDelta),
        weightedContribution: safeNum(entry.weightedContribution),
        contributionPct:      safeNum(entry.contributionPct)
    };
}

function safeNum(v: number): number {
    return isFinite(v) ? +v.toFixed(4) : 0;
}

/**
 * Builds a ClaudeInputPack from a validated RootCausePack.
 * 
 * This is the ONLY entry point for creating data that Claude can see.
 * It guarantees:
 *   1. No raw SQL leaks
 *   2. No raw dataset rows leak
 *   3. No file paths leak
 *   4. All numbers are finite and rounded
 *   5. Only validated, structured facts pass through
 */
export function buildClaudeInputPack(
    question: string,
    pack: RootCausePack
): ClaudeInputPack {

    const validationErrors = pack.validationErrors ?? [];

    const claudePack: ClaudeInputPack = {
        question,
        metricName:               pack.metricName,
        metricChange:             pack.metricChange,

        topPositiveContributors:  pack.topPositiveContributors.map(sanitizeContributor),
        topNegativeContributors:  pack.topNegativeContributors.map(sanitizeContributor),

        affectedHotels:           pack.affectedHotels.map(sanitizeContributor),
        affectedChains:           pack.affectedChains.map(sanitizeContributor),
        affectedSuppliers:        pack.affectedSuppliers.map(sanitizeContributor),
        affectedAPWBuckets:       pack.affectedAPWBuckets.map(sanitizeContributor),

        trendSummary:             pack.trendSummary.map(t => ({
            period: t.period,
            value:  safeNum(t.value)
        })),

        contradictionDetected:    pack.contradictionDetected ?? false,
        expectedDirection:        pack.expectedDirection,

        validationStatus:         validationErrors.length === 0 ? "PASSED" : "FAILED",
        validationErrors,

        totalRows:                pack.totalRows,
        builtAt:                  pack.builtAt
    };

    console.log(
        `[CLAUDE_CONTRACT] Pack built | metric=${claudePack.metricName} | ` +
        `positive=${claudePack.topPositiveContributors.length} | ` +
        `negative=${claudePack.topNegativeContributors.length} | ` +
        `contradiction=${claudePack.contradictionDetected} | ` +
        `validation=${claudePack.validationStatus}`
    );

    return claudePack;
}

/**
 * Validates that a ClaudeInputPack contains no forbidden fields.
 * Used as a safety net before any Claude API call.
 */
export function assertClaudeInputSafe(pack: ClaudeInputPack): void {
    const json = JSON.stringify(pack);
    
    // Check for common raw data leaks
    const FORBIDDEN_PATTERNS = [
        /SELECT\s+/i,
        /FROM\s+data_table/i,
        /read_csv_auto/i,
        /WHERE\s+/i,
        /GROUP\s+BY/i,
        /\.csv/i,
        /\.parquet/i,
        /\\\\Users\\\\/i,
        /\/tmp\//i
    ];

    for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(json)) {
            throw new Error(
                `[CLAUDE_CONTRACT] SECURITY VIOLATION: ClaudeInputPack contains forbidden pattern: ${pattern}. ` +
                `Raw data may be leaking to the LLM layer.`
            );
        }
    }
}
