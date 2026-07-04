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

export type ResponseSource = "ANALYTICS" | "CLAUDE_NARRATIVE" | "CLAUDE_RECOMMENDATION" | "NATURAL_RESPONSE";

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
    /\btell\s+me\s+why\b/i,
    /\bmost\s+important\b/i,
    /\bleadership\s+should\s+know\b/i,
    /\bwhat\s+matters\s+most\b/i,
    /\bbiggest\s+insight\b/i,
    /\bkey\s+takeaway\b/i,
    /\bexecutive\s+takeaway\b/i,
    /\bwhat\s+should\s+executives\s+know\b/i,
    /\bsingle\s+biggest\s+risk\b/i,
    /\bsingle\s+biggest\s+opportunity\b/i,
    /\bperformance\b/i,
    /\bdeep\s+dive\b/i
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
    /\baddress(ing)?\b/i,
    /\bfocus\s+(on|upon)\b/i,
    /\bprioritiz(e|ing|ation)\b/i,
    /\bwin\s+against\b/i,
    /\bbeat\b/i,
    /\bcompet(e|ing|itive)\b/i
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
 * Detects whether the user's question is asking for high-level executive interpretation.
 * Used by the router to override raw analytics routes (e.g., TREND) and force ROOT_CAUSE.
 */
export function isExecutiveQuestion(question: string): boolean {
    const q = question.toLowerCase();
    const EXECUTIVE_PATTERNS: RegExp[] = [
        /\bleadership\b/i,
        /\bexecutive\b/i,
        /\bceo\b/i,
        /\bcro\b/i,
        /\bboard\b/i,
        /\bmost\s+important\b/i,
        /\bbiggest\s+insight\b/i,
        /\bkey\s+takeaway\b/i,
        /\bwhat\s+matters\s+most\b/i,
        /\bwhat\s+should\s+executives\s+know\b/i,
        /\blargest\s+takeaway\b/i,
        /\bsingle\s+biggest\s+risk\b/i,
        /\bsingle\s+biggest\s+opportunity\b/i,
        /\bhighest\s+roi\b/i,
        /\bfastest\s+win\b/i,
        /\bwhat\s+(do|should)\s+(we|i)\s+(need\s+to\s+)?focus\s+(on|upon)\b/i
    ];
    
    const match = EXECUTIVE_PATTERNS.some(p => p.test(q));
    console.log(`[EXECUTIVE_DETECT] executive=${match}`);
    return match;
}

/**
 * Detects executive prioritization queries that should bypass RCA validation.
 */
export function isExecutivePriorityQuestion(question: string): boolean {
    const q = question.toLowerCase();
    const patterns: RegExp[] = [
        /focus\s+(on|upon)/i,
        /highest\s+roi/i,
        /fastest\s+win/i,
        /hurting\s+(us|me)(\s+the)?(\s+most)?/i,
        /single\s+most\s+important/i,
        /only\s+fix\s+one\s+thing/i,
        /allocate\s+resources/i,
        /leadership\s+should\s+know/i,
        /biggest\s+opportunity/i,
        /biggest\s+problem/i,
        /biggest\s+driver/i,
        /highest\s+leverage/i,
        /what\s+should\s+(we|leadership|i)\s+(need\s+to\s+)?focus/i,
        /where\s+should\s+(we|i)\s+allocate/i,
        /what\s+is\s+hurting/i,
        /if\s+we\s+only\s+fix/i,
        /what\s+should\s+leadership\s+know/i
    ];
    const match = patterns.some(p => p.test(q));
    console.log(`[EXECUTIVE_PRIORITY_DETECT] match=${match}`);
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
