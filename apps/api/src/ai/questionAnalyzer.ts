import { QuestionAnalysis, QuestionIntent, QuestionFilter } from "./questionTypes.js";
import {
    METRIC_SYNONYMS,
    DIMENSION_SYNONYMS,
    INTENT_SIGNALS,
    TIME_SIGNALS
} from "./questionKnowledge.js";
import { DIMENSION_REGISTRY } from "./dimensionRegistry.js";
import { buildTimeFilter } from "./timeFilterExtractor.js";
// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalizes text for matching: lowercase, collapse whitespace, remove punctuation
 * but keep hyphens (needed for "look-to-book") and +/< chars (needed for APW buckets).
 */
function normalize(text: string): string {
    return text.toLowerCase().replace(/[^\w\s\-+<>]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Returns true if the phrase appears as a whole-word match in the normalized text.
 */
function containsPhrase(text: string, phrase: string): boolean {
    const escaped = phrase.replace(/[-+<>]/g, "\\$&").replace(/[.*?^${}()|[\]\\]/g, "\\$&");
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
                break;
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

// ─── Filter Extractors ────────────────────────────────────────────────────────

/**
 * Extractor 1: APW Bucket Filters
 * Detects APW bucket values like "31-45 days", "< 10 days", "90+ days".
 * Also matches shorthand like "31-45", "<10", "90+" without the word "days".
 */
function extractApwBucketFilters(question: string): QuestionFilter[] {
    const filters: QuestionFilter[] = [];
    const apwDef = DIMENSION_REGISTRY["apw"];
    if (!apwDef?.validValues) return filters;

    const q = question.toLowerCase().replace(/\s+/g, "");

    // Build a set of patterns for each bucket — both the full form and shorthand
    const bucketPatterns: Array<{ bucket: string; patterns: string[] }> = [
        { bucket: "< 10 days", patterns: ["<10days", "<10", "under10"] },
        { bucket: "11-30 days", patterns: ["11-30days", "11-30"] },
        { bucket: "31-45 days", patterns: ["31-45days", "31-45"] },
        { bucket: "46-60 days", patterns: ["46-60days", "46-60"] },
        { bucket: "61-90 days", patterns: ["61-90days", "61-90"] },
        { bucket: "90+ days", patterns: ["90+days", "90+", "over90", "above90"] },
        { bucket: "Other", patterns: ["other"] },
    ];

    for (const { bucket, patterns } of bucketPatterns) {
        for (const pattern of patterns) {
            if (q.includes(pattern)) {
                // Avoid duplicate filters for the same bucket
                if (!filters.some(f => f.value === bucket)) {
                    filters.push({ dimension: "apw", operator: "=", value: bucket });
                }
                break;
            }
        }
    }

    return filters;
}

/**
 * Extractor 2: Status Filters
 * Detects "Winning" / "Losing" / "Equal" competitive status values.
 */
function extractStatusFilters(question: string): QuestionFilter[] {
    const filters: QuestionFilter[] = [];
    const statusDef = DIMENSION_REGISTRY["competitive_status"];
    if (!statusDef?.validValues) return filters;

    const qLower = question.toLowerCase();
    for (const status of statusDef.validValues) {
        if (qLower.includes(status.toLowerCase())) {
            filters.push({ dimension: "competitive_status", operator: "=", value: status });
        }
    }
    return filters;
}

/**
 * Extractor 3: Named Entity Filters (open-ended proper nouns)
 * Detects proper-noun values like city names, supplier names, hotel names.
 * These are capitalized words/phrases that are NOT recognized business terms.
 *
 * Strategy: scan for capitalized tokens that aren't synonyms or stop words.
 * These become ILIKE filters across open-ended dimensions.
 */
const STOP_WORDS = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "was", "are", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "not", "no", "nor",
    "so", "yet", "both", "either", "neither", "each", "every", "all",
    "show", "compare", "what", "why", "how", "which", "who", "when", "where",
    "between", "across", "over", "under", "above", "below", "during",
    "top", "bottom", "best", "worst", "high", "low", "last", "this", "next",
    "give", "list", "tell", "find", "get"
]);

function extractNamedEntityFilters(originalQuestion: string): QuestionFilter[] {
    const filters: QuestionFilter[] = [];
    const tokens = originalQuestion.split(/\s+/);
    let currentChunk: string[] = [];

    const flush = () => {
        if (currentChunk.length === 0) return;
        const phrase = currentChunk.join(" ");
        const normalized = phrase.toLowerCase();

        const isKnownTerm =
            METRIC_SYNONYMS.some(e => e.synonyms.some(s => s === normalized)) ||
            DIMENSION_SYNONYMS.some(e => e.synonyms.some(s => s === normalized)) ||
            STOP_WORDS.has(normalized);

        if (!isKnownTerm) {
            // This is an unknown proper noun — create an unclassified ILIKE filter
            // The dimension is "unknown" and will be resolved by the filterBuilder
            // against all string columns (fallback behavior)
            filters.push({ dimension: "_entity", operator: "ILIKE", value: phrase });
        }
        currentChunk = [];
    };

    for (const token of tokens) {
        const clean = token.replace(/[^a-zA-Z0-9\s]/g, "");
        if (!clean) continue;

        if (STOP_WORDS.has(clean.toLowerCase())) {
            flush();
            continue;
        }

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

/**
 * Extractor 4: Time Filters
 * Wraps time reference signals as structured filters on the time dimension.
 */
function extractTimeFilters(normalizedQuestion: string): QuestionFilter[] {
    const filters: QuestionFilter[] = [];
    const sorted = [...TIME_SIGNALS].sort((a, b) => b.length - a.length);
    let tempText = normalizedQuestion;

    for (const signal of sorted) {
        if (containsPhrase(tempText, signal)) {
            //filters.push({ dimension: "time", operator: "=", value: signal });
            const filter =
                buildTimeFilter(signal);

            if (filter) {
                filters.push(filter);
            }
            tempText = tempText.replace(
                new RegExp(`(?:^|\\s|\\b)${signal}(?:\\s|$|\\b)`, "ig"), " "
            );
        }
    }
    return filters;
}

// ─── Master Filter Extractor ──────────────────────────────────────────────────

/**
 * Merges all specialized filter extractors into a single QuestionFilter[].
 * Order matters: more specific extractors (APW, status) run first so their
 * values aren't also picked up by the generic named-entity extractor.
 */
function extractAllFilters(originalQuestion: string, normalizedQuestion: string): QuestionFilter[] {
    // Run specific extractors first — they produce exact-match filters
    const apwFilters = extractApwBucketFilters(originalQuestion);
    const statusFilters = extractStatusFilters(originalQuestion);

    // Collect all already-identified values so named-entity extractor can skip them
    const recognizedValues = new Set([
        ...apwFilters.map(f => String(f.value).toLowerCase()),
        ...statusFilters.map(f => String(f.value).toLowerCase())
    ]);

    // Named entity extractor for open-ended proper nouns (cities, suppliers, etc.)
    const entityFilters = extractNamedEntityFilters(originalQuestion).filter(
        f => !recognizedValues.has(String(f.value).toLowerCase())
    );

    return [...apwFilters, ...statusFilters, ...entityFilters];
}

// ─── Time Reference Extraction ────────────────────────────────────────────────

function extractTimeReferences(normalizedQuestion: string): string[] {
    const found: string[] = [];
    const sorted = [...TIME_SIGNALS].sort((a, b) => b.length - a.length);
    let tempText = normalizedQuestion;

    for (const signal of sorted) {
        if (containsPhrase(tempText, signal)) {
            found.push(signal);
            tempText = tempText.replace(
                new RegExp(`(?:^|\\s|\\b)${signal}(?:\\s|$|\\b)`, "ig"), " "
            );
        }
    }
    return found;
}

// ─── Intent Detection ─────────────────────────────────────────────────────────

function detectIntent(normalizedQuestion: string): QuestionIntent {
    const scores: Record<QuestionIntent, number> = {
        ROOT_CAUSE: 0, TREND: 0, COMPARISON: 0, RANKING: 0,
        CORRELATION: 0, ANOMALY: 0, BREAKDOWN: 0, SUMMARY: 0
    };

    for (const [intent, signals] of Object.entries(INTENT_SIGNALS)) {
        for (const signal of signals) {
            if (containsPhrase(normalizedQuestion, signal)) {
                scores[intent as QuestionIntent]++;
            }
        }
    }

    let maxScore = 0;
    let bestIntent: QuestionIntent = "SUMMARY";

    for (const [intent, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            bestIntent = intent as QuestionIntent;
        }
    }

    return bestIntent;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parses a natural language question into a structured QuestionAnalysis.
 */
export function analyzeQuestion(question: string): QuestionAnalysis {
    const normalizedQuestion = normalize(question);

    const metrics = extractMetrics(normalizedQuestion);
    const dimensions = extractDimensions(normalizedQuestion);
    //const filters = extractAllFilters(question, normalizedQuestion);
    const filters = [

        ...extractAllFilters(
            question,
            normalizedQuestion
        ),

        ...extractTimeFilters(
            question
        )

    ];
    console.log(
        "TIME FILTERS:",
        extractTimeFilters(question)
    )
    const timeRefs = extractTimeReferences(normalizedQuestion);
    const intent = detectIntent(normalizedQuestion);

    const analysis: QuestionAnalysis = {
        metrics,
        dimensions,
        filters,
        timeReferences: timeRefs,
        intent,
        originalQuestion: question
    };

    console.log(
        `[ANALYSIS] Intent: ${intent} | Metrics: [${metrics.join(",")}] | ` +
        `Dims: [${dimensions.join(",")}] | ` +
        `Filters: [${filters.map(f => `${f.dimension}=${f.value}`).join(",")}] | ` +
        `Time: [${timeRefs.join(",")}]`
    );

    return analysis;
}
