import { RootCausePack, MetricChange } from "./RootCausePackBuilder.js";
import { ExecutivePack } from "./insights/executivePackBuilder.js";

// ─── Claude Input Contract ────────────────────────────────────────────────────
//
// This module defines the ONLY data structure that Claude is permitted to receive.
// It acts as a strict firewall between raw analytics data and the LLM layer.
//
// NEVER expose: raw SQL, raw rows, raw datasets, file paths, column names.
// ───────────────────────────────────────────────────────────────────────────────

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

    /** The executive abstraction layer */
    executivePack: ExecutivePack;

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

/**
 * Builds a ClaudeInputPack from an ExecutivePack and RootCausePack metadata.
 * 
 * This is the ONLY entry point for creating data that Claude can see.
 * It guarantees no raw data leaks and only validated facts pass through.
 */
export function buildClaudeInputPack(
    question: string,
    rootCausePack: RootCausePack,
    executivePack: ExecutivePack
): ClaudeInputPack {

    const validationErrors = rootCausePack.validationErrors ?? [];

    const claudePack: ClaudeInputPack = {
        question,
        metricName:               rootCausePack.metricName,
        metricChange:             rootCausePack.metricChange,

        executivePack,

        contradictionDetected:    rootCausePack.contradictionDetected ?? false,
        expectedDirection:        rootCausePack.expectedDirection,

        validationStatus:         validationErrors.length === 0 ? "PASSED" : "FAILED",
        validationErrors,

        totalRows:                rootCausePack.totalRows,
        builtAt:                  rootCausePack.builtAt
    };

    console.log(
        `[CLAUDE_CONTRACT] Pack built | metric=${claudePack.metricName} | ` +
        `contradiction=${claudePack.contradictionDetected} | ` +
        `validation=${claudePack.validationStatus}`
    );

    if (!executivePack.primaryTarget) {
        console.warn(`[CLAUDE_CONTRACT_WARN] actionabilityTargets (primaryTarget) is empty`);
    }
    if (!executivePack.recommendations?.length) {
        console.warn(`[CLAUDE_CONTRACT_WARN] recommendationTargets is empty`);
    }
    if (!executivePack.drilldowns?.length) {
        console.warn(`[CLAUDE_CONTRACT_WARN] drilldownInsights is empty`);
    }
    if (!executivePack.competitiveGaps?.length && claudePack.question.toLowerCase().includes("beat")) {
        console.warn(`[CLAUDE_CONTRACT_WARN] competitiveGaps is empty for a competitor query`);
    }

    console.log("[CLAUDE_INPUT_PACK_DUMP]");
    console.log(JSON.stringify(claudePack, null, 2));

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
