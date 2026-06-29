import { generateTemplatedSql } from "./sqlTemplateEngine.js";
import { extractComparisonEntities } from "../services/comparisonEngine.js";
import { isExecutivePriorityQuestion } from "../services/claudeRequestDetector.js";
import { logger } from "../lib/logger.js";
// ─── Keyword Dictionaries ─────────────────────────────────────────────────────
/**
 * TREND signals — time-series and periodicity language.
 */
const TREND_SIGNALS = [
    "trend", "trending",
    "over time",
    "monthly", "month over month", "mom",
    "weekly", "week over week", "wow",
    "quarterly", "quarter over quarter", "qoq",
    "yearly", "year over year", "yoy",
    "annual", "annually",
    "historical", "history",
    "time series", "time-series"
];
/**
 * COMPARISON signals — side-by-side entity or period language.
 */
const COMPARISON_SIGNALS = [
    " vs ", " vs.", " versus ",
    "compare", "comparison",
    "against",
    "side by side", "side-by-side"
];
/**
 * CONTRIBUTION signals — dimension-member attribution language.
 *
 * These are CHECKED BEFORE ROOT_CAUSE to prevent words like "decline"
 * or "drop" inside contribution questions from triggering the root cause route.
 *
 * NOTE: partial strings are intentional (e.g. "contribut" covers contribution /
 * contributor / contributors / contributed).
 */
const CONTRIBUTION_SIGNALS = [
    "contribut", // contribution, contributor, contributors, contributed
    "driver", // driver, drivers
    "driving",
    "drove",
    "impact", // impact, impacted, impacting
    "largest impact",
    "biggest impact",
    "most impact",
    "top contributor",
    "top negative",
    "top positive"
];
/**
 * ROOT_CAUSE signals — causal inquiry language.
 *
 * CRITICAL RULE: This list must ONLY contain words that express causal intent.
 * Words like "decline", "drop", "decrease", "increase", "growth" must NEVER
 * appear here — they commonly occur inside CONTRIBUTION questions.
 */
const ROOT_CAUSE_SIGNALS = [
    "why did",
    "why does",
    "why is ",
    "why are",
    "why was",
    "why were",
    "root cause",
    "root-cause",
    "what caused",
    "what happened",
    "what went wrong",
    "explain the",
    "explain why",
    "explain how"
];
/**
 * ROOT_CAUSE intent-level words — standalone "why" only when it's the
 * first substantive word (i.e., a genuine causal question, not buried in a phrase).
 */
const ROOT_CAUSE_LEADING_WORDS = [
    "why ",
    "cause",
    "reason"
];
// ─── Detector Functions ───────────────────────────────────────────────────────
/**
 * TREND detection.
 * Fires on: intent=TREND or any trend keyword.
 */
export function isTrendQuestion(question, intent) {
    if (intent === "TREND")
        return true;
    const lower = question.toLowerCase();
    return TREND_SIGNALS.some(s => lower.includes(s));
}
/**
 * COMPARISON detection.
 * Fires on: intent=COMPARISON or any comparison keyword.
 */
export function isComparisonQuestion(question, intent) {
    if (intent === "COMPARISON")
        return true;
    const lower = question.toLowerCase();
    return COMPARISON_SIGNALS.some(s => lower.includes(s));
}
/**
 * CONTRIBUTION detection.
 * Fires on: any contribution keyword.
 * MUST be checked BEFORE isRootCauseQuestion() — contribution questions
 * frequently mention outcome words ("decline", "drop") that could otherwise
 * leak into the ROOT_CAUSE route.
 */
export function isContributionQuestion(question) {
    const lower = question.toLowerCase();
    return CONTRIBUTION_SIGNALS.some(s => lower.includes(s));
}
/**
 * ROOT_CAUSE detection.
 * Fires on: intent=ROOT_CAUSE or explicit causal language.
 *
 * Design rule: ONLY matches genuine causal inquiry markers.
 * Does NOT match "decline", "drop", "decrease", "increase", "growth" — those
 * words are intentionally excluded because they appear in CONTRIBUTION questions.
 *
 * This function is ONLY reached after isContributionQuestion() has already
 * returned false, so there is no risk of stealing contribution queries.
 */
export function isRootCauseQuestion(question, intent) {
    if (intent === "ROOT_CAUSE")
        return true;
    const lower = question.toLowerCase();
    // Strong multi-word causal phrases (highest confidence)
    if (ROOT_CAUSE_SIGNALS.some(s => lower.includes(s)))
        return true;
    // Leading causal words — only trigger when the question STARTS with them
    // (avoids false positives like "supplier impact reason")
    const trimmed = lower.trim();
    if (ROOT_CAUSE_LEADING_WORDS.some(w => trimmed.startsWith(w)))
        return true;
    return false;
}
// ─── Intents ──────────────────────────────────────────────────────────────────
const TEMPLATE_INTENTS = new Set([
    "RANKING",
    "SUMMARY",
    "BREAKDOWN"
]);
const LLM_ONLY_INTENTS = new Set([
    "CORRELATION",
    "ANOMALY"
]);
// ─── Structured logger ────────────────────────────────────────────────────────
function logRouterDecision(analysis, route, matchedRule) {
    const filterStr = analysis.filters
        .map(f => `${f.dimension}${f.operator}${f.value}`)
        .join(", ") || "(none)";
    logger.info({
        question: analysis.originalQuestion,
        intent: analysis.intent,
        metrics: analysis.metrics,
        dimensions: analysis.dimensions,
        filters: filterStr,
        matchedRule,
        route
    }, "Router decision");
}
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Production-grade Deterministic Analytics Router
 *
 * Route Precedence (highest → lowest):
 *  1. TREND        — keyword or intent=TREND
 *  2. COMPARISON   — keyword or intent=COMPARISON
 *  3. CONTRIBUTION — keyword ("contributed", "driver", "impact", etc.)
 *  4. ROOT_CAUSE   — causal language only ("why did", "root cause", "what caused")
 *  5. TEMPLATE     — intent in RANKING | SUMMARY | BREAKDOWN
 *  6. LLM          — final fallback
 *
 * CRITICAL PRECEDENCE NOTE:
 *  CONTRIBUTION fires BEFORE ROOT_CAUSE. This is intentional.
 *  Questions like "which hotels contributed most to the decline" contain the
 *  word "decline" but are CONTRIBUTION queries, not ROOT_CAUSE queries.
 *  The ROOT_CAUSE detector only matches explicit causal markers (why/cause/
 *  root cause) and is never reached when contribution keywords are present.
 *
 * Expected routing:
 *  "which hotels contributed most to the decline" → CONTRIBUTION ✓
 *  "which chains drove the decline"               → CONTRIBUTION ✓
 *  "top contributors"                             → CONTRIBUTION ✓
 *  "why did bangkok lose win rate"                → ROOT_CAUSE ✓
 *  "what caused the drop"                         → ROOT_CAUSE ✓
 *  "explain the decline"                          → ROOT_CAUSE ✓
 *  "compare london vs bangkok"                    → COMPARISON ✓
 *  "win rate trend"                               → TREND ✓
 *  "best hotels in london"                        → TEMPLATE ✓
 */
export function routeQuery(analysis, semanticLayer) {
    const { intent, originalQuestion: question } = analysis;
    // ── Priority 0: EXECUTIVE_PRIORITY ───────────────────────────────────────
    if (intent === "EXECUTIVE_PRIORITY" || isExecutivePriorityQuestion(question)) {
        logRouterDecision(analysis, "EXECUTIVE_PRIORITY", "EXECUTIVE_PRIORITY_INTENT");
        return {
            route: "EXECUTIVE_PRIORITY",
            type: "EXECUTIVE_PRIORITY",
            explanation: "Routed to Executive Priority Engine — leadership prioritization without RCA validation."
        };
    }
    // ── Priority 1: TREND ──────────────────────────────────────────────────────
    if (isTrendQuestion(question, intent)) {
        const rule = intent === "TREND" ? "TREND_INTENT" : "TREND_KEYWORD";
        logRouterDecision(analysis, "TREND", rule);
        return {
            route: "TREND",
            type: "TREND",
            explanation: "Routed to Trend Engine — deterministic time-series SQL generation."
        };
    }
    // ── Priority 2: COMPARISON / COMPARE_ENTITIES ──────────────────────────────
    if (isComparisonQuestion(question, intent)) {
        const entities = extractComparisonEntities(analysis, semanticLayer);
        if (entities) {
            logRouterDecision(analysis, "COMPARE_ENTITIES", "COMPARE_ENTITIES_TWO_SIDES");
            return {
                route: "COMPARE_ENTITIES",
                type: "COMPARE_ENTITIES",
                explanation: "Routed to Entity Comparison Pack Builder — structured side-by-side analysis."
            };
        }
        const rule = intent === "COMPARISON" ? "COMPARISON_INTENT" : "COMPARISON_KEYWORD";
        logRouterDecision(analysis, "COMPARISON", rule);
        return {
            route: "COMPARISON",
            type: "COMPARISON",
            explanation: "Routed to Comparison Engine — deterministic side-by-side SQL generation."
        };
    }
    // ── Priority 2.5: COMPETITOR STRATEGY ──────────────────────────────────────
    if (intent === "COMPETITOR_STRATEGY") {
        logRouterDecision(analysis, "COMPETITOR_STRATEGY", "COMPETITOR_INTENT");
        return {
            route: "COMPETITOR_STRATEGY",
            type: "COMPETITOR_STRATEGY",
            explanation: "Routed to Competitor Strategy Engine — deterministic gap analysis."
        };
    }
    // ── Priority 3: CONTRIBUTION ───────────────────────────────────────────────
    // MUST come before ROOT_CAUSE. Contribution questions mention outcome words
    // ("decline", "drop") that would otherwise falsely match ROOT_CAUSE keywords.
    if (isContributionQuestion(question)) {
        logRouterDecision(analysis, "CONTRIBUTION", "CONTRIBUTION_KEYWORD");
        return {
            route: "CONTRIBUTION",
            type: "CONTRIBUTION",
            explanation: "Routed to Contribution Engine — deterministic weighted contribution ranking."
        };
    }
    // ── Priority 4: ROOT_CAUSE ─────────────────────────────────────────────────
    // Only reached when no contribution keyword matched above.
    // Only fires on genuine causal language — NOT on "decline", "drop", etc.
    if (isRootCauseQuestion(question, intent)) {
        const rule = intent === "ROOT_CAUSE" ? "ROOT_CAUSE_INTENT" : "ROOT_CAUSE_KEYWORD";
        logRouterDecision(analysis, "ROOT_CAUSE", rule);
        return {
            route: "ROOT_CAUSE",
            type: "ROOT_CAUSE",
            explanation: "Routed to Root Cause Pack Builder — structural analysis without LLM."
        };
    }
    // ── Priority 5: TEMPLATE ───────────────────────────────────────────────────
    if (TEMPLATE_INTENTS.has(intent)) {
        const sql = generateTemplatedSql(analysis, semanticLayer);
        if (sql) {
            logRouterDecision(analysis, "TEMPLATE", `TEMPLATE_INTENT(${intent})`);
            return {
                route: "TEMPLATE",
                type: "TEMPLATE",
                sql,
                explanation: `Deterministic ${intent.toLowerCase()} query — no LLM required.`
            };
        }
        logger.warn({ intent, question: question.slice(0, 60) }, "Template engine returned null; falling back to LLM");
    }
    // ── Priority 6: LLM (final fallback) ──────────────────────────────────────
    const llmReason = LLM_ONLY_INTENTS.has(intent)
        ? `LLM_ONLY_INTENT(${intent})`
        : `NO_DETERMINISTIC_MATCH(intent=${intent})`;
    logRouterDecision(analysis, "LLM", llmReason);
    return {
        route: "LLM",
        type: "LLM",
        explanation: `Routed to Claude — ${llmReason}.`
    };
}
// ─── Unit-test style route expectations (documentation) ──────────────────────
//
// These are the canonical routing expectations for the test suite.
// Run against routeQuery() with a mock semanticLayer.
//
// CONTRIBUTION:
//   "which hotels contributed most to the decline"  → CONTRIBUTION
//   "which chains drove the decline"                → CONTRIBUTION
//   "top contributors to win rate drop"             → CONTRIBUTION
//   "top negative contributors"                     → CONTRIBUTION
//   "supplier contribution analysis"                → CONTRIBUTION
//   "hotel contribution to win rate"                → CONTRIBUTION
//
// ROOT_CAUSE:
//   "why did bangkok lose win rate"                 → ROOT_CAUSE
//   "why did pattaya decline"                       → ROOT_CAUSE
//   "what caused the drop"                          → ROOT_CAUSE
//   "explain the decline"                           → ROOT_CAUSE
//   "root cause analysis"                           → ROOT_CAUSE
//   "what happened in Q1"                           → ROOT_CAUSE
//
// TREND:
//   "win rate trend"                                → TREND
//   "monthly win rate"                              → TREND
//   "supplier trend"                                → TREND
//   "quarterly performance"                         → TREND
//
// COMPARISON:
//   "compare london vs bangkok"                     → COMPARISON
//   "compare q1 vs q2"                              → COMPARISON
//   "compare supplier a vs supplier b"              → COMPARISON
//
// TEMPLATE:
//   "best hotels in london"                         → TEMPLATE
//   "worst suppliers"                               → TEMPLATE
//   "top 10 destinations"                           → TEMPLATE
//
// LLM:
//   "find correlations between apw and win rate"    → LLM
//   "identify unusual patterns in supplier data"    → LLM
