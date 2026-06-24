/**
 * Ranking / prioritization polarity detection.
 * NEGATIVE queries must return worst performers first (ASC).
 * POSITIVE queries must return best performers first (DESC).
 */

const NEGATIVE_KEYWORDS = [
    "worst", "drag", "hurting", "losing", "weakness", "underperforming",
    "problem", "risk", "decline", "declining", "lowest", "bottom", "least",
    "minimum", "min", "bleeding", "weak", "lagging", "fix"
];

const POSITIVE_KEYWORDS = [
    "best", "top", "highest", "strongest", "growth", "opportunity",
    "opportunities", "leading", "leader", "scale", "expand", "winning"
];

export type QueryPolarity = "NEGATIVE" | "POSITIVE" | "NEUTRAL";

export function detectQueryPolarity(question: string): QueryPolarity {
    const lower = question.toLowerCase();

    const hasNegative = NEGATIVE_KEYWORDS.some(kw => lower.includes(kw));
    const hasPositive = POSITIVE_KEYWORDS.some(kw => lower.includes(kw));

    if (hasNegative && !hasPositive) return "NEGATIVE";
    if (hasPositive && !hasNegative) return "POSITIVE";
    if (hasNegative) return "NEGATIVE";
    return "NEUTRAL";
}

export function polarityToSortDirection(polarity: QueryPolarity): "ASC" | "DESC" {
    if (polarity === "NEGATIVE") return "ASC";
    if (polarity === "POSITIVE") return "DESC";
    return "DESC";
}

export function detectSortDirection(question: string): "ASC" | "DESC" {
    return polarityToSortDirection(detectQueryPolarity(question));
}

export function isNegativeIntent(question: string): boolean {
    return detectQueryPolarity(question) === "NEGATIVE";
}

export function isPositiveIntent(question: string): boolean {
    return detectQueryPolarity(question) === "POSITIVE";
}
