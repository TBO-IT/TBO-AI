import { QuestionAnalysis, QuestionIntent, QuestionFilter } from "./questionTypes.js";
import {
    METRIC_SYNONYMS,
    DIMENSION_SYNONYMS,
    INTENT_SIGNALS,
    TIME_SIGNALS
} from "./questionKnowledge.js";
import { DIMENSION_REGISTRY } from "./dimensionRegistry.js";
import { buildTimeFilter } from "./timeFilterExtractor.js";
import { normalizeBusinessSemantics } from "./businessNormalizer.js";
// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalizes text for matching: lowercase, collapse whitespace, remove punctuation
 * but keep hyphens (needed for "look-to-book"), decimals, =, and +/< chars (needed for APW buckets).
 */
function normalize(text: string): string {
    return text.toLowerCase().replace(/[^\w\s\-+<>=\.]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Returns true if the phrase appears as a whole-word match in the normalized text.
 */
function containsPhrase(text: string, phrase: string): boolean {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\\-]/g, "\\$&");
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
        // Use whole-word matching so "losing" inside "not losing" or compound phrases
        // is still detected, but the match is anchored to word boundaries.
        const pattern = new RegExp(`(?:^|\\s|\\b)${status.toLowerCase()}(?:\\s|$|\\b)`, "i");
        if (pattern.test(qLower)) {
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
    "give", "list", "tell", "find", "get", "if", "roi", "apw",
    "me", "my", "we", "us", "our", "i", "you", "he", "she", "they", "it", "them", "their", "your"
]);

const TIME_COMPARISON_TERMS = new Set([
    "wow",
    "qoq",
    "mom",
    "yoy",
    "week over week",
    "quarter over quarter",
    "month over month",
    "year over year",
    "week-over-week",
    "quarter-over-quarter",
    "month-over-month",
    "year-over-year"
]);

function stripStopWords(phrase: string): string {
    const words = phrase.trim().split(/\s+/);
    while (words.length > 0 && STOP_WORDS.has(words[0].toLowerCase())) {
        words.shift();
    }
    while (words.length > 0 && STOP_WORDS.has(words[words.length - 1].toLowerCase())) {
        words.pop();
    }
    return words.join(" ");
}

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

        if (!isKnownTerm && !TIME_COMPARISON_TERMS.has(normalized)) {
            // This is an unknown proper noun — create an unclassified ILIKE filter
            // The dimension is "unknown" and will be resolved by the filterBuilder
            // against all string columns (fallback behavior)
            filters.push({ dimension: "_entity", operator: "ILIKE", value: phrase });
        }
        currentChunk = [];
    };

    for (let i = 0; i < tokens.length; i++) {
        const clean = tokens[i].replace(/[^a-zA-Z0-9\s]/g, "");
        if (!clean) continue;

        if (STOP_WORDS.has(clean.toLowerCase()) && currentChunk.length === 0) {
            flush();
            continue;
        }

        const isCapitalized = /^[A-Z][a-zA-Z]*$/.test(clean);
        const isAcronym = /^[A-Z]{2,}$/.test(clean);
        const skipAcronyms = new Set(["ROI", "APW", "CEO", "CRO", "SQL", "TBO"]);

        if (isCapitalized || isAcronym) {
            if (skipAcronyms.has(clean)) {
                flush();
                continue;
            }
            currentChunk.push(clean);
        } else if (currentChunk.length > 0) {
            // Check if this is a connector word (de, del, la, of, the) and the NEXT word is capitalized
            const connectors = new Set(["de", "del", "la", "las", "los", "of", "the", "and"]);
            const nextClean = (i + 1 < tokens.length) ? tokens[i + 1].replace(/[^a-zA-Z0-9\s]/g, "") : "";
            const nextIsCapitalized = /^[A-Z][a-zA-Z]*$/.test(nextClean) || /^[A-Z]{2,}$/.test(nextClean);

            if (connectors.has(clean.toLowerCase()) && nextIsCapitalized) {
                currentChunk.push(clean);
            } else {
                flush();
            }
        } else {
            flush();
        }
    }
    flush();

    // ── FALLBACK / EXTRA: Lowercase lists of entities separated by and/or/vs/comma ──
    // Canonical competitive status words — must never be treated as entity tokens.
    const STATUS_WORDS = new Set(
        (DIMENSION_REGISTRY["competitive_status"]?.validValues ?? ["Winning", "Losing", "Equal"])
            .map(v => v.toLowerCase())
    );

    /**
     * Strips canonical status value words from a segment so that
     * "bangkok losing" becomes "bangkok" and is emitted as a destination entity,
     * while the status filter is independently produced by extractStatusFilters().
     */
    function stripStatusWords(phrase: string): string {
        return phrase
            .split(/\s+/)
            .filter(word => !STATUS_WORDS.has(word.toLowerCase()))
            .join(" ")
            .trim();
    }

    const qLower = originalQuestion.toLowerCase();
    const segments = qLower.split(/\s*(?:,|\band\b|\bor\b|\bvs\b|\bversus\b)\s*/i);
    for (const seg of segments) {
        // First strip punctuation and stop words, then also strip status value words
        const withoutPunct = seg.replace(/[^a-zA-Z0-9\s]/g, "").trim();
        const withoutStop = stripStopWords(withoutPunct);
        const cleaned = stripStatusWords(withoutStop);
        if (cleaned) {
            const normalized = cleaned.toLowerCase();
            const wordCount = cleaned.split(/\s+/).length;

            const isStop = STOP_WORDS.has(normalized);
            const isNum = /^\d+(?:\.\d+)?$/.test(normalized);
            const isTimeRef = TIME_COMPARISON_TERMS.has(normalized);

            // Exclude if the segment contains any known metric or dimension synonym as a word
            const containsMetricOrDim =
                METRIC_SYNONYMS.some(e => e.synonyms.some(s => normalized === s || normalized.includes(" " + s) || normalized.includes(s + " "))) ||
                DIMENSION_SYNONYMS.some(e => e.synonyms.some(s => normalized === s || normalized.includes(" " + s) || normalized.includes(s + " ")));

            if (!isStop && !containsMetricOrDim && !isNum && !isTimeRef && wordCount <= 3) {
                if (!filters.some(f => String(f.value).toLowerCase() === normalized)) {
                    filters.push({ dimension: "_entity", operator: "ILIKE", value: cleaned });
                }
            }
        }
    }

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

/**
 * Intent Detector — Strict Precedence Cascade
 *
 * Replaces the old score-counting approach, which had no ordering guarantees.
 * The first matching rule wins. Priority order matches the router's route precedence.
 *
 * Precedence:
 *  1. TREND        — time-series / periodicity language
 *  2. COMPARISON   — side-by-side / "vs" language
 *  3. CONTRIBUTION — attribution / driver language  ← BEFORE ROOT_CAUSE
 *  4. ROOT_CAUSE   — genuine causal language only (no outcome words)
 *  5. RANKING      — top / bottom / best / worst
 *  6. BREAKDOWN    — split / segment / by dimension
 *  7. SUMMARY      — default fallback
 *
 * CRITICAL: CONTRIBUTION fires before ROOT_CAUSE.
 * "which hotels contributed most to the decline" must return CONTRIBUTION,
 * not ROOT_CAUSE, even though it contains the word "decline".
 */
function detectIntent(normalizedQuestion: string): QuestionIntent {
    const q = normalizedQuestion.toLowerCase();

    // ── Helper: partial match (for prefix-style signals like "contribut") ───────
    const hasPartial = (signals: string[]) =>
        signals.some(s => q.includes(s));

    // ── Helper: phrase match (whole-word / whole-phrase) ───────────────────────
    const hasPhrase = (signals: string[]) =>
        signals.some(s => containsPhrase(q, s));

    // ── 1. TREND ──────────────────────────────────────────────────────────────
    if (hasPhrase(INTENT_SIGNALS.TREND)) {
        console.log(`[INTENT_DETECTOR]\n  QUESTION:     ${normalizedQuestion}\n  MATCHED_RULE: TREND_PHRASE\n  INTENT:       TREND`);
        return "TREND";
    }

    // ── 1.5 EXECUTIVE_PRIORITY ────────────────────────────────────────────────
    // Leadership prioritization queries — must fire before ROOT_CAUSE/COMPARISON
    if (hasPartial(INTENT_SIGNALS.EXECUTIVE_PRIORITY) || isExecutivePriorityQuestion(normalizedQuestion)) {
        console.log(`[INTENT_DETECTOR]\n  QUESTION:     ${normalizedQuestion}\n  MATCHED_RULE: EXECUTIVE_PRIORITY\n  INTENT:       EXECUTIVE_PRIORITY`);
        return "EXECUTIVE_PRIORITY";
    }

    // ── 1.5 COMPETITOR_STRATEGY ───────────────────────────────────────────────
    if (hasPartial(INTENT_SIGNALS.COMPETITOR_STRATEGY)) {
        console.log(`[INTENT_DETECTOR]\n  QUESTION:     ${normalizedQuestion}\n  MATCHED_RULE: COMPETITOR_KEYWORD\n  INTENT:       COMPETITOR_STRATEGY`);
        return "COMPETITOR_STRATEGY";
    }

    // ── 2. COMPARISON ─────────────────────────────────────────────────────────
    if (hasPartial(INTENT_SIGNALS.COMPARISON)) {
        console.log(`[INTENT_DETECTOR]\n  QUESTION:     ${normalizedQuestion}\n  MATCHED_RULE: COMPARISON_KEYWORD\n  INTENT:       COMPARISON`);
        return "COMPARISON";
    }

    // ── 3. CONTRIBUTION ───────────────────────────────────────────────────────
    // MUST be checked BEFORE ROOT_CAUSE.
    // Contribution questions often contain outcome words ("decline", "drop")
    // that would falsely match ROOT_CAUSE if ROOT_CAUSE were checked first.
    if (hasPartial(INTENT_SIGNALS.CONTRIBUTION)) {
        console.log(`[INTENT_DETECTOR]\n  QUESTION:     ${normalizedQuestion}\n  MATCHED_RULE: CONTRIBUTION_KEYWORD\n  INTENT:       CONTRIBUTION`);
        return "CONTRIBUTION";
    }

    // ── 4. ROOT_CAUSE ─────────────────────────────────────────────────────────
    // Only genuine causal markers — "decline", "drop", "decrease" are intentionally
    // absent from ROOT_CAUSE signals in questionKnowledge.ts.
    if (hasPartial(INTENT_SIGNALS.ROOT_CAUSE)) {
        console.log(`[INTENT_DETECTOR]\n  QUESTION:     ${normalizedQuestion}\n  MATCHED_RULE: ROOT_CAUSE_KEYWORD\n  INTENT:       ROOT_CAUSE`);
        return "ROOT_CAUSE";
    }
    // Leading "why" — genuine question start, not buried mid-sentence
    if (q.trim().startsWith("why ")) {
        console.log(`[INTENT_DETECTOR]\n  QUESTION:     ${normalizedQuestion}\n  MATCHED_RULE: ROOT_CAUSE_LEADING_WHY\n  INTENT:       ROOT_CAUSE`);
        return "ROOT_CAUSE";
    }

    // ── 5. RANKING ────────────────────────────────────────────────────────────
    if (hasPhrase(INTENT_SIGNALS.RANKING) || /\bwhich\s+(hotel|supplier|destination|chain|city|apw)\b/.test(q)) {
        console.log(`[INTENT_DETECTOR]\n  QUESTION:     ${normalizedQuestion}\n  MATCHED_RULE: RANKING_KEYWORD\n  INTENT:       RANKING`);
        return "RANKING";
    }

    // ── 6. ANOMALY ────────────────────────────────────────────────────────────
    if (hasPhrase(INTENT_SIGNALS.ANOMALY)) {
        console.log(`[INTENT_DETECTOR]\n  QUESTION:     ${normalizedQuestion}\n  MATCHED_RULE: ANOMALY_KEYWORD\n  INTENT:       ANOMALY`);
        return "ANOMALY";
    }

    // ── 7. CORRELATION ────────────────────────────────────────────────────────
    if (hasPhrase(INTENT_SIGNALS.CORRELATION)) {
        console.log(`[INTENT_DETECTOR]\n  QUESTION:     ${normalizedQuestion}\n  MATCHED_RULE: CORRELATION_KEYWORD\n  INTENT:       CORRELATION`);
        return "CORRELATION";
    }

    // ── 8. BREAKDOWN ──────────────────────────────────────────────────────────
    if (hasPhrase(INTENT_SIGNALS.BREAKDOWN)) {
        console.log(`[INTENT_DETECTOR]\n  QUESTION:     ${normalizedQuestion}\n  MATCHED_RULE: BREAKDOWN_KEYWORD\n  INTENT:       BREAKDOWN`);
        return "BREAKDOWN";
    }

    // ── 8.5. LIST ─────────────────────────────────────────────────────────────
    const listVerbs = ["show", "list", "display", "give me", "fetch", "give"];
    const startsWithListVerb = listVerbs.some(verb => q.trim().startsWith(verb + " ") || q.trim() === verb);
    const hasFocusNoun = /\b(hotels?|properties|property|suppliers?|vendors?|providers?|otas?|chains?|brands?|groups?|destinations?|markets?|locations?|cities|city|regions?|competitors?|apw|lead\s+time|purchase\s+window)\b/i.test(q);

    let hasMetricSynonym = false;
    for (const entry of METRIC_SYNONYMS) {
        for (const synonym of entry.synonyms) {
            if (containsPhrase(q, synonym)) {
                hasMetricSynonym = true;
                break;
            }
        }
        if (hasMetricSynonym) break;
    }

    const rangeFilters = extractRangeFilters(q, normalizedQuestion);
    const hasRangeFilters = rangeFilters.length > 0;
    const isAggMetric = hasMetricSynonym && !hasRangeFilters;

    if ((startsWithListVerb && hasFocusNoun && !isAggMetric) || (hasFocusNoun && !isAggMetric && !/\b(why|trend|compare|vs|versus)\b/.test(q))) {
        console.log(`[INTENT_DETECTOR]\n  QUESTION:     ${normalizedQuestion}\n  MATCHED_RULE: LIST_RULE\n  INTENT:       LIST`);
        return "LIST";
    }

    // ── 9. SUMMARY (default fallback) ─────────────────────────────────────────
    console.log(`[INTENT_DETECTOR]\n  QUESTION:     ${normalizedQuestion}\n  MATCHED_RULE: DEFAULT_FALLBACK\n  INTENT:       SUMMARY`);
    return "SUMMARY";
}

/**
 * Extractor 5: Range Filters
 * Detects numeric range expressions like "between X and Y", "X to Y", "greater than X", etc.
 * Associates them with the closest dimension or metric synonym in the question.
 */
function extractRangeFilters(question: string, normalizedQuestion: string): QuestionFilter[] {
    const filters: QuestionFilter[] = [];
    const q = normalizedQuestion.toLowerCase();

    // Order from most specific/complex to least to avoid partial match overlaps
    const patterns = [
        {
            regex: /\bbetween\s+(\d+(?:\.\d+)?)\s+and\s+(\d+(?:\.\d+)?)\b/g,
            type: "between"
        },
        {
            regex: /\b(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)\b/g,
            type: "between"
        },
        {
            regex: /(?:greater\s+than\s+or\s+equal\s+to|>=)\s*(\d+(?:\.\d+)?)\b/g,
            type: ">="
        },
        {
            regex: /(?:less\s+than\s+or\s+equal\s+to|<=)\s*(\d+(?:\.\d+)?)\b/g,
            type: "<="
        },
        {
            regex: /(?:greater\s+than|above|>(?!=))\s*(\d+(?:\.\d+)?)\b/g,
            type: ">"
        },
        {
            regex: /(?:less\s+than|below|<(?!=))\s*(\d+(?:\.\d+)?)\b/g,
            type: "<"
        }
    ];

    const targets: { canonicalKey: string; index: number }[] = [];

    for (const entry of METRIC_SYNONYMS) {
        for (const synonym of entry.synonyms) {
            let idx = q.indexOf(synonym);
            while (idx !== -1) {
                targets.push({ canonicalKey: entry.canonicalKey, index: idx });
                idx = q.indexOf(synonym, idx + 1);
            }
        }
    }

    for (const entry of DIMENSION_SYNONYMS) {
        for (const synonym of entry.synonyms) {
            let idx = q.indexOf(synonym);
            while (idx !== -1) {
                targets.push({ canonicalKey: entry.canonicalKey, index: idx });
                idx = q.indexOf(synonym, idx + 1);
            }
        }
    }

    for (const pattern of patterns) {
        let match;
        pattern.regex.lastIndex = 0;
        while ((match = pattern.regex.exec(q)) !== null) {
            const matchIndex = match.index;
            const val1 = Number(match[1]);
            const val2 = match[2] ? Number(match[2]) : undefined;

            let closestDim = "apw"; // default fallback
            let minDistance = Infinity;

            for (const target of targets) {
                const dist = Math.abs(target.index - matchIndex);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestDim = target.canonicalKey;
                }
            }

            if (pattern.type === "between" && val2 !== undefined) {
                filters.push({ dimension: closestDim, operator: "BETWEEN", value: `${val1} AND ${val2}` });
            } else if (pattern.type === ">=") {
                filters.push({ dimension: closestDim, operator: ">=", value: val1 });
            } else if (pattern.type === "<=") {
                filters.push({ dimension: closestDim, operator: "<=", value: val1 });
            } else if (pattern.type === ">") {
                filters.push({ dimension: closestDim, operator: ">", value: val1 });
            } else if (pattern.type === "<") {
                filters.push({ dimension: closestDim, operator: "<", value: val1 });
            }
        }
    }

    return filters;
}

/**
 * Detects the primary business object/focus of the question.
 */
function detectPrimaryBusinessObject(
    question: string,
    dimensions: string[],
    filters: QuestionFilter[]
): string | null {
    const q = question.toLowerCase();

    // 1. Explicit keyword checks (chains/suppliers before hotel to avoid compound word mismatch)
    if (/\bchains?\b|\bbrands?\b|\bgroups?\b/.test(q)) return "chain";
    if (/\bsuppliers?\b|\bvendors?\b|\bproviders?\b|\botas?\b/.test(q)) return "supplier";
    if (/\bhotels?\b|\bproperties\b|\bproperty\b/.test(q)) return "hotel";
    if (/\bdestinations?\b|\bmarkets?\b|\blocations?\b|\bcities\b|\bcity\b|\bregions?\b/.test(q)) return "destination";
    if (/\bcompetitors?\b|\bthird\s+part(y|ies)\b|\bthird-part(y|ies)\b/.test(q)) return "thirdparty";
    if (/\bapw\b|\blead\s+time\b|\bpurchase\s+window\b/.test(q)) return "apw";

    // 2. Lookup well-known entities in TBO dataset
    const chainKeywords = ["marriott", "hilton", "hyatt", "accor", "ihg", "sheraton", "westin", "holiday inn", "premier inn"];
    const destKeywords = ["london", "paris", "phuket", "tokyo", "new york", "dubai", "pattaya"];
    const supplierKeywords = ["tripjack", "otilla", "booking.com", "expedia", "agoda"];
    const competitorKeywords = ["affiliate", "synxis"];

    if (chainKeywords.some(kw => q.includes(kw))) return "chain";
    if (destKeywords.some(kw => q.includes(kw))) return "destination";
    if (supplierKeywords.some(kw => q.includes(kw))) return "supplier";
    if (competitorKeywords.some(kw => q.includes(kw))) return "thirdparty";

    // 3. Fallback to parsed dimensions
    if (dimensions.includes("hotel")) return "hotel";
    if (dimensions.includes("supplier")) return "supplier";
    if (dimensions.includes("chain")) return "chain";
    if (dimensions.includes("destination") || dimensions.includes("city") || dimensions.includes("country")) return "destination";
    if (dimensions.includes("apw")) return "apw";
    
    // Check filter dimensions
    for (const f of filters) {
        if (f.dimension === "hotel") return "hotel";
        if (f.dimension === "supplier") return "supplier";
        if (f.dimension === "chain") return "chain";
        if (f.dimension === "destination" || f.dimension === "city" || f.dimension === "country") return "destination";
        if (f.dimension === "apw") return "apw";
        if (f.dimension === "thirdparty") return "thirdparty";
    }

    return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

import { isExecutiveQuestion, isExecutivePriorityQuestion } from "../services/claudeRequestDetector.js";
import { inferDefaultMetric } from "./metricInference.js";

/**
 * Parses a natural language question into a structured QuestionAnalysis.
 */
export function analyzeQuestion(question: string): QuestionAnalysis {
    const normalizedQuestion = normalize(question);

    const metrics = extractMetrics(normalizedQuestion);
    const dimensions = extractDimensions(normalizedQuestion);
    
    // Extract range filters
    const rangeFilters = extractRangeFilters(question, normalizedQuestion);

    const filters = [
        ...extractAllFilters(
            question,
            normalizedQuestion
        ),
        ...extractTimeFilters(
            question
        ),
        ...rangeFilters
    ];
    console.log(
        "TIME FILTERS:",
        extractTimeFilters(question)
    )
    const timeRefs = extractTimeReferences(normalizedQuestion);
    let intent = detectIntent(normalizedQuestion);

    // ─── Executive Routing Override ───────────────────────────────────────────
    if (isExecutiveQuestion(question)) {
        const hasTimeComparison = Array.from(TIME_COMPARISON_TERMS).some(term =>
            normalizedQuestion.includes(term)
        );
        if (hasTimeComparison) {
            console.log(`[ROUTE_OVERRIDE] executiveInterpretation=true | Changing intent from ${intent} to ROOT_CAUSE`);
            intent = "ROOT_CAUSE";
        }
    }

    // Detect primary focus
    const focus = detectPrimaryBusinessObject(question, dimensions, filters);

    const analysis: QuestionAnalysis = {
        metrics,
        dimensions,
        filters,
        timeReferences: timeRefs,
        intent,
        originalQuestion: question,
        focus
    };

    const normalizedAnalysis = normalizeBusinessSemantics(analysis);

    console.log(
        `[ANALYSIS] Intent: ${normalizedAnalysis.intent} | Metrics: [${normalizedAnalysis.metrics.join(",")}] | ` +
        `Dims: [${normalizedAnalysis.dimensions.join(",")}] | ` +
        `Filters: [${normalizedAnalysis.filters.map(f => `${f.dimension}=${f.value}`).join(",")}] | ` +
        `Time: [${normalizedAnalysis.timeReferences.join(",")}] | Focus: ${normalizedAnalysis.focus}`
    );

    return normalizedAnalysis;
}
