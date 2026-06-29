import { logger } from "../lib/logger.js";
const PERFORMANCE_KEYWORDS = [
    "losing", "underperforming", "declining", "worst", "improve",
    "fix", "drag", "hurting", "weakness", "problem", "risk", "prioritize"
];
/**
 * Auto-injects win_rate when the question implies performance analysis
 * but no metric was explicitly named.
 */
export function inferDefaultMetric(question, analysis, semanticLayer) {
    if (analysis.metrics.length > 0)
        return analysis;
    const lower = question.toLowerCase();
    const impliesPerformance = PERFORMANCE_KEYWORDS.some(kw => lower.includes(kw));
    const isCausal = analysis.intent === "ROOT_CAUSE" || lower.startsWith("why ");
    if (!impliesPerformance && !isCausal)
        return analysis;
    const available = semanticLayer.metricKeys;
    const defaultMetric = available.includes("win_rate")
        ? "win_rate"
        : available[0];
    if (!defaultMetric)
        return analysis;
    logger.info({ defaultMetric, question: question.slice(0, 60) }, "Metric inference auto-injected metric");
    return {
        ...analysis,
        metrics: [defaultMetric]
    };
}
