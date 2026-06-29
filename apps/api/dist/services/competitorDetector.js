// ─── Competitor Detector ──────────────────────────────────────────────────────
//
// Extracts competitor context from user questions.
//
// When a user asks "What should we do to beat TripJack?", this service:
//   1. Detects the competitive intent signal ("beat")
//   2. Extracts the competitor name ("TripJack")
//   3. Validates against known thirdparty values from dataset metadata
//   4. Returns a CompetitorContext for downstream filter injection
//
// Usage:
//   const ctx = detectCompetitorContext(question, metadata);
//   if (ctx) inject filter: { dimension: "thirdparty", value: ctx.competitorName }
// ──────────────────────────────────────────────────────────────────────────────
// ─── Competitive Phrases ──────────────────────────────────────────────────────
// These phrases signal a competitor-focused query. The word(s) immediately
// following the phrase are treated as the competitor name candidate.
const COMPETITIVE_PHRASES = [
    "beat",
    "win against",
    "outperform",
    "compete with",
    "compete against",
    "market share against",
    "gain share from",
    "take share from",
    "overtake",
    "catch up to",
    "catch up with",
    "close gap with",
    "vs",
    "versus",
];
// ─── Normalization ────────────────────────────────────────────────────────────
/** Normalizes a name for case-insensitive, whitespace-tolerant matching. */
export function normalizeCompetitorName(name) {
    return name.toLowerCase().trim();
}
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Detects competitor context from the user's question.
 *
 * Strategy:
 *   1. Search for competitive phrases in the question
 *   2. Extract the word(s) following the phrase as competitor candidate
 *   3. Fuzzy-match against metadata.thirdParties for validation
 *   4. If no phrase match, check if any thirdparty filter was resolved
 *
 * @returns CompetitorContext if a competitor is detected, null otherwise
 */
export function detectCompetitorContext(question, metadata, existingFilters) {
    const lower = question.toLowerCase().trim();
    const knownCompetitors = metadata.thirdParties ?? [];
    // ── Strategy 1: Phrase-based extraction ────────────────────────────────
    for (const phrase of COMPETITIVE_PHRASES) {
        const phraseIdx = lower.indexOf(phrase);
        if (phraseIdx === -1)
            continue;
        // Extract text after the competitive phrase
        const afterPhrase = question
            .slice(phraseIdx + phrase.length)
            .trim()
            // Remove trailing punctuation and common filler words
            .replace(/[?.!,;:]+$/, "")
            .trim();
        if (!afterPhrase)
            continue;
        // Take the first 1-3 words as the competitor candidate
        // e.g. "beat TripJack by APW" → candidate = "TripJack"
        // e.g. "beat Booking.com in Dubai" → candidate = "Booking.com"
        const candidateWords = afterPhrase.split(/\s+/).slice(0, 3);
        // Stop at prepositions/conjunctions
        const stopWords = new Set(["by", "in", "on", "at", "for", "with", "and", "or", "the", "our", "their", "across", "to"]);
        const filtered = [];
        for (const word of candidateWords) {
            if (stopWords.has(word.toLowerCase()))
                break;
            filtered.push(word);
        }
        const candidate = filtered.join(" ").trim();
        if (!candidate)
            continue;
        // Validate against known thirdparty values (NOT suppliername)
        const matched = fuzzyMatchThirdParty(candidate, knownCompetitors);
        if (matched) {
            console.log(`[COMPETITOR_EXTRACT]\nname=${matched}`);
            return {
                competitorName: matched,
                sourceColumn: "thirdparty",
                matchedIn: "phrase_extraction",
            };
        }
    }
    // ── Strategy 2: Entity resolution fallback ────────────────────────────
    // If the entity resolver already matched a thirdparty filter AND the question
    // contains competitive intent signals, treat that thirdparty as the competitor.
    if (existingFilters) {
        const hasCompetitiveIntent = COMPETITIVE_PHRASES.some(p => lower.includes(p));
        if (hasCompetitiveIntent) {
            const thirdpartyFilter = existingFilters.find(f => f.dimension === "thirdparty");
            if (thirdpartyFilter) {
                const name = String(thirdpartyFilter.value);
                console.log(`[COMPETITOR_EXTRACT]\nname=${name}`);
                return {
                    competitorName: name,
                    sourceColumn: "thirdparty",
                    matchedIn: "entity_resolution",
                };
            }
        }
    }
    console.log(`[COMPETITOR_DETECTION] No competitor detected in: "${question.slice(0, 80)}"`);
    return null;
}
// ─── Fuzzy Matching ───────────────────────────────────────────────────────────
/**
 * Fuzzy-matches a candidate string against known thirdparty values.
 * Uses LOWER(TRIM) normalization so executives can type any capitalization.
 *
 * Matching rules (in priority order):
 *   1. Exact match (case-insensitive, trimmed)
 *   2. Known value contains candidate (e.g. "tripjack" matches "Tripjack")
 *   3. Candidate contains known value
 *
 * @returns The exact thirdparty name from the dataset, or null
 */
function fuzzyMatchThirdParty(candidate, thirdParties) {
    const candidateNorm = normalizeCompetitorName(candidate);
    // Priority 1: Exact match (case-insensitive, trimmed)
    for (const name of thirdParties) {
        if (normalizeCompetitorName(name) === candidateNorm) {
            return name;
        }
    }
    // Priority 2: Known value contains candidate (candidate is a substring)
    for (const name of thirdParties) {
        if (normalizeCompetitorName(name).includes(candidateNorm) && candidateNorm.length >= 3) {
            return name;
        }
    }
    // Priority 3: Candidate contains known value (known value is a substring)
    for (const name of thirdParties) {
        const nameNorm = normalizeCompetitorName(name);
        if (candidateNorm.includes(nameNorm) && nameNorm.length >= 3) {
            return name;
        }
    }
    return null;
}
