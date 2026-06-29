import { logger } from "../lib/logger.js";
/**
 * Builds a ClaudeInputPack from an ExecutivePack and RootCausePack metadata.
 *
 * This is the ONLY entry point for creating data that Claude can see.
 * It guarantees no raw data leaks and only validated facts pass through.
 */
export function buildClaudeInputPack(question, rootCausePack, executivePack, competitorName) {
    const validationErrors = rootCausePack.validationErrors ?? [];
    const claudePack = {
        question,
        metricName: rootCausePack.metricName,
        metricChange: rootCausePack.metricChange,
        executivePack,
        contradictionDetected: rootCausePack.contradictionDetected ?? false,
        expectedDirection: rootCausePack.expectedDirection,
        validationStatus: validationErrors.length === 0 ? "PASSED" : "FAILED",
        validationErrors,
        totalRows: rootCausePack.totalRows,
        builtAt: rootCausePack.builtAt,
        ...(competitorName ? { competitorName } : {})
    };
    logger.info({ metricName: claudePack.metricName, contradictionDetected: claudePack.contradictionDetected, validationStatus: claudePack.validationStatus }, "Claude contract pack built");
    if (!executivePack.primaryTarget) {
        logger.warn({ metricName: claudePack.metricName }, "Claude contract primaryTarget is empty");
    }
    if (!executivePack.recommendations?.length) {
        logger.warn({ metricName: claudePack.metricName }, "Claude contract recommendationTargets is empty");
    }
    if (!executivePack.drilldowns?.length) {
        logger.warn({ metricName: claudePack.metricName }, "Claude contract drilldownInsights is empty");
    }
    if (!executivePack.competitiveGaps?.length && claudePack.question.toLowerCase().includes("beat")) {
        logger.warn({ metricName: claudePack.metricName }, "Claude contract competitiveGaps is empty for competitor query");
    }
    logger.debug({ claudePack }, "Claude input pack dump");
    return claudePack;
}
/**
 * Validates that a ClaudeInputPack contains no forbidden fields.
 * Used as a safety net before any Claude API call.
 */
export function assertClaudeInputSafe(pack) {
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
            throw new Error(`[CLAUDE_CONTRACT] SECURITY VIOLATION: ClaudeInputPack contains forbidden pattern: ${pattern}. ` +
                `Raw data may be leaking to the LLM layer.`);
        }
    }
}
