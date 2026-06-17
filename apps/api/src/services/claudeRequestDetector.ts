// ─── Claude Request Detector ──────────────────────────────────────────────────
//
// Classifies user questions to determine whether Claude should be invoked
// for narrative enrichment or strategic recommendations.
//
// These detectors run AFTER the analytics route is determined.
// They do NOT affect routing — they only control whether Claude
// is called on the response layer.
//
// Rules:
//   Plain ROOT_CAUSE → deterministic (no Claude)
//   ROOT_CAUSE + "executive summary" → Claude narrative
//   ROOT_CAUSE + "what should we do" → Claude recommendations
// ───────────────────────────────────────────────────────────────────────────────

export type ResponseSource = "ANALYTICS" | "CLAUDE_NARRATIVE" | "CLAUDE_RECOMMENDATION";

// ─── Narrative Signals ────────────────────────────────────────────────────────

const NARRATIVE_PATTERNS: RegExp[] = [
    /executive\s+summary/i,
    /\bsummariz(e|es|ed|ing)\b/i,
    /\bsummary\b/i,
    /\bexplain\b/i,
    /\bexplanation\b/i,
    /\bkey\s+drivers?\b/i,
    /\bkey\s+risks?\b/i,
    /\binsights?\b/i,
    /\banalysis\b/i,
    /\bbrief(ing)?\b/i,
    /\bnarrative\b/i,
    /\bwrite[\s-]up\b/i,
    /\boverview\b/i,
    /\btell\s+me\s+why\b/i
];

// ─── Recommendation Signals ───────────────────────────────────────────────────

const RECOMMENDATION_PATTERNS: RegExp[] = [
    /what\s+should\s+(we|i)\s+do/i,
    /\brecommend(ation)?s?\b/i,
    /\brecommended\s+actions?\b/i,
    /\baction\s+plan\b/i,
    /\bstrateg(y|ies|ic)\b/i,
    /\bimprov(e|ement|ing)\b/i,
    /\bhow\s+(can|do|should)\s+(we|i)\b/i,
    /\bnext\s+steps?\b/i,
    /\bfix(es|ing)?\b/i,
    /\bopportunit(y|ies)\b/i,
    /\bmitigat(e|ion)\b/i,
    /\baddress(ing)?\b/i
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detects whether the user is requesting a Claude-generated narrative.
 *
 * Examples:
 *   "why did bangkok lose win rate in april?" → false
 *   "why did bangkok lose win rate in april? give me an executive summary" → true
 *   "summarize the key drivers of win rate decline" → true
 */
export function detectNarrativeRequest(question: string): boolean {
    const q = question.toLowerCase();
    const match = NARRATIVE_PATTERNS.some(p => p.test(q));

    console.log(`[CLAUDE_DETECT] narrative=${match} | question="${question.slice(0, 80)}"`);
    return match;
}

/**
 * Detects whether the user is requesting Claude-generated recommendations.
 *
 * Examples:
 *   "why did bangkok lose win rate?" → false
 *   "what should we do to improve bangkok" → true
 *   "give me recommendations for win rate improvement" → true
 */
export function detectRecommendationRequest(question: string): boolean {
    const q = question.toLowerCase();
    const match = RECOMMENDATION_PATTERNS.some(p => p.test(q));

    console.log(`[CLAUDE_DETECT] recommendation=${match} | question="${question.slice(0, 80)}"`);
    return match;
}

/**
 * Determines the response source for a ROOT_CAUSE query.
 *
 * Priority: RECOMMENDATION > NARRATIVE > ANALYTICS
 * (If user asks for both, recommendations win because they include narrative context.)
 */
export function classifyResponseSource(question: string): ResponseSource {
    if (detectRecommendationRequest(question)) return "CLAUDE_RECOMMENDATION";
    if (detectNarrativeRequest(question)) return "CLAUDE_NARRATIVE";
    return "ANALYTICS";
}
