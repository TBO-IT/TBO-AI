import { QuestionAnalysis, QuestionIntent } from "./questionTypes.js";
import {
    METRIC_SYNONYMS,
    DIMENSION_SYNONYMS,
    INTENT_SIGNALS,
    TIME_SIGNALS
} from "./questionKnowledge.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalizes text for matching: lowercase, collapse whitespace, remove punctuation
 * but keep hyphens (needed for "look-to-book").
 */
function normalize(text: string): string {
    return text.toLowerCase().replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Returns true if the phrase appears as a whole-word match in the normalized text.
 * Uses word-boundary detection to avoid partial matches (e.g. "win" in "winning").
 */
function containsPhrase(text: string, phrase: string): boolean {
    // Escape special regex chars in phrase, then wrap in word boundaries
    const escaped = phrase.replace(/[-]/g, "\\-").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:^|\\s|\\b)${escaped}(?:\\s|$|\\b)`, "i");
    return pattern.test(text);
}

// ─── Metric Extraction ────────────────────────────────────────────────────────

function extractMetrics(normalizedQuestion: string): string[] {
    const found = new Set<string>();

    for (const entry of METRIC_SYNONYMS) {
        for (const synonym of entry.synonyms) {
            if (containsPhrase(normalizedQuestion, synonym)) {
                found.add(entry.canonicalKey);
                break; // One synonym hit is enough for this metric
            }
        }
    }

    return Array.from(found);
}

// ─── Dimension Extraction ─────────────────────────────────────────────────────

function extractDimensions(normalizedQuestion: string): string[] {
    const found = new Set<string>();

    for (const entry of DIMENSION_SYNONYMS) {
        for (const synonym of entry.synonyms) {
            if (containsPhrase(normalizedQuestion, synonym)) {
                found.add(entry.canonicalKey);
                break;
            }
        }
    }

    return Array.from(found);
}

// ─── Filter Extraction ────────────────────────────────────────────────────────

/**
 * Extracts likely proper-noun filter values — capitalized words/phrases
 * that are not recognized business terms (metrics, dimensions, intent words).
 *
 * Strategy: find capitalized tokens that don't match any known synonym
 * and aren't common English stop words.
 */
const STOP_WORDS = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "was", "are", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "not", "no", "nor",
    "so", "yet", "both", "either", "neither", "each", "every", "all",
    "show", "compare", "what", "why", "how", "which", "who", "when", "where",
    "between", "across", "over", "under", "above", "below", "during",
    "top", "bottom", "best", "worst", "high", "low", "last", "this", "next"
]);

function extractFilters(originalQuestion: string): string[] {
    const filters: string[] = [];

    // Find runs of words that start with a capital letter
    // These are likely proper nouns (city names, supplier names, etc.)
    const tokens = originalQuestion.split(/\s+/);

    let currentChunk: string[] = [];

    const flush = () => {
        if (currentChunk.length > 0) {
            const phrase = currentChunk.join(" ");
            // Only keep it if it's not a recognized synonym
            const normalized = phrase.toLowerCase();
            const isKnown =
                METRIC_SYNONYMS.some(e => e.synonyms.some(s => s === normalized)) ||
                DIMENSION_SYNONYMS.some(e => e.synonyms.some(s => s === normalized)) ||
                STOP_WORDS.has(normalized);

            if (!isKnown) {
                filters.push(phrase);
            }
            currentChunk = [];
        }
    };

    for (const token of tokens) {
        const clean = token.replace(/[^a-zA-Z0-9\s]/g, "");
        if (!clean) continue;

        if (STOP_WORDS.has(clean.toLowerCase())) {
            flush();
            continue;
        }

        // Check if it starts with a capital letter and is not all-caps (acronym check)
        const isCapitalized = /^[A-Z][a-z]/.test(clean);
        const isAcronym = /^[A-Z]{2,}$/.test(clean);

        if (isCapitalized || isAcronym) {
            currentChunk.push(clean);
        } else {
            flush();
        }
    }
    flush();

    return filters;
}

// ─── Time Reference Extraction ────────────────────────────────────────────────

function extractTimeReferences(normalizedQuestion: string): string[] {
    const found: string[] = [];
    // Check from longest signals to shortest to avoid "may" matching before "last may"
    const sorted = [...TIME_SIGNALS].sort((a, b) => b.length - a.length);

    let tempText = normalizedQuestion;

    for (const signal of sorted) {
        if (containsPhrase(tempText, signal)) {
            found.push(signal);
            // Replace the found signal so we don't double count overlaps
            tempText = tempText.replace(new RegExp(`(?:^|\\s|\\b)${signal}(?:\\s|$|\\b)`, "ig"), " ");
        }
    }
    return found;
}

// ─── Intent Detection ─────────────────────────────────────────────────────────

function detectIntent(normalizedQuestion: string): QuestionIntent {
    // Score each intent by how many of its signals appear in the question
    const scores: Record<QuestionIntent, number> = {
        ROOT_CAUSE: 0,
        TREND: 0,
        COMPARISON: 0,
        RANKING: 0,
        CORRELATION: 0,
        ANOMALY: 0,
        BREAKDOWN: 0,
        SUMMARY: 0
    };

    for (const [intent, signals] of Object.entries(INTENT_SIGNALS)) {
        for (const signal of signals) {
            if (containsPhrase(normalizedQuestion, signal)) {
                scores[intent as QuestionIntent]++;
            }
        }
    }

    // Return the intent with the highest score; fall back to SUMMARY
    const best = (Object.entries(scores) as [QuestionIntent, number][])
        .reduce((acc, cur) => (cur[1] > acc[1] ? cur : acc), ["SUMMARY" as QuestionIntent, -1]);

    return best[0];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parses a natural language question into a structured QuestionAnalysis.
 */
export function analyzeQuestion(question: string): QuestionAnalysis {
    const normalizedQuestion = normalize(question);

    const metrics    = extractMetrics(normalizedQuestion);
    const dimensions = extractDimensions(normalizedQuestion);
    const filters    = extractFilters(question);  // Uses original for proper casing
    const timeRefs   = extractTimeReferences(normalizedQuestion);
    const intent     = detectIntent(normalizedQuestion);

    return {
        metrics,
        dimensions,
        filters,
        timeReferences: timeRefs,
        intent,
        originalQuestion: question
    };
}
