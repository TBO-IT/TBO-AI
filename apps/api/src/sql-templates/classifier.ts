import { TemplateDefinition, ClassifierResult } from "./types.js";

const REJECTION_KEYWORDS = [
    "why", "cause", "reason", "but", "only", "excluding", "except", "should", "recommend", "how to"
];

const SYNONYM_DICTIONARY: Record<string, string[]> = {
    "win rate": ["success rate", "conversion rate", "win ratio", "winning rate", "win percentage", "hit rate", "performance", "performing"],
    "trend": ["history", "over time", "historically", "trajectory", "trends"],
    "supplier": ["vendor", "partner", "suppliers", "vendors"],
    "chain": ["brand", "hotel chain", "chains", "brands"],
    "price": ["cost", "rate", "fare", "pricing", "costs"],
    "volume": ["amount", "count", "bookings", "number of bookings", "quantity"]
};

export class Classifier {
    private templates: TemplateDefinition[] = [];

    register(template: TemplateDefinition) {
        this.templates.push(template);
    }

    private normalizeSemantics(text: string): string {
        const mappings: { variation: string, canonical: string }[] = [];
        for (const [canonical, variations] of Object.entries(SYNONYM_DICTIONARY)) {
            // Protect the canonical term itself so its parts aren't replaced
            mappings.push({ variation: canonical, canonical });
            for (const variation of variations) {
                mappings.push({ variation, canonical });
            }
        }
        
        // Sort by length descending so longer phrases match first
        mappings.sort((a, b) => b.variation.length - a.variation.length);

        const pattern = mappings.map(m => `\\b${m.variation}\\b`).join('|');
        const regex = new RegExp(`(${pattern})`, 'gi');

        const lookup = new Map<string, string>();
        for (const m of mappings) {
            lookup.set(m.variation.toLowerCase(), m.canonical);
        }

        return text.replace(regex, (match) => {
            return lookup.get(match.toLowerCase()) || match;
        }).replace(/\s+/g, ' ').trim();
    }

    private normalize(text: string): string {
        let normalized = text.toLowerCase().trim();
        // Remove punctuation
        normalized = normalized.replace(/[?.,!]/g, "");
        // Apply semantic translation
        normalized = this.normalizeSemantics(normalized);
        console.log(`[DEBUG] Normalized "${text}" -> "${normalized}"`);
        return normalized;
    }

    private hasRejectionKeywords(text: string): boolean {
        const words = text.split(/\s+/);
        return REJECTION_KEYWORDS.some(kw => words.includes(kw));
    }

    private extractUniversalComponents(text: string): ClassifierResult | null {
        // Try to extract metric
        let metric = ""; 
        if (text.includes("price") && (text.includes("diff") || text.includes("gap") || text.includes("compare"))) {
            metric = "avg_price_diff";
        } else if (text.includes("volume") || text.includes("count") || text.includes("how many")) {
            metric = "volume";
        } else if (text.includes("win rate") || text.includes("winning") || text.includes("success") || text.includes("performance")) {
            metric = "win_rate";
        }

        // Try to extract groupBy
        let groupBy: string[] = [];
        const byMatch = text.match(/by\s+([a-z0-9\s,]+)(?:$|\s(?:for|in|where|excluding|except))/i);
        if (byMatch) {
            const groupStr = byMatch[1];
            const possibleDims = ["destination", "chain", "supplier", "thirdparty", "hotel", "status", "apw", "booking window"];
            for (const dim of possibleDims) {
                if (groupStr.includes(dim)) {
                    groupBy.push(dim === "booking window" ? "apw_bucket" : dim === "supplier" ? "thirdparty" : dim);
                }
            }
        }

        // Try to extract threshold
        let threshold = "";
        const threshMatch = text.match(/(?:over|above|below|under|>|<)\s*(\d+)%?/i);
        if (threshMatch) {
            threshold = threshMatch[0];
        }

        // The rest of the text might contain filters
        const leftover = text.replace(/by\s+[a-z0-9\s,]+/i, "").trim();

        // Check for drill-down phrasing
        const isDrillDown = /^(?:what about|how about|and for|what if)/i.test(text);

        if (groupBy.length > 0 || threshold || text.includes("win rate") || text.includes("price") || text.includes("volume") || isDrillDown) {
            return {
                matched: true,
                template_id: "T00_UNIVERSAL",
                slots: {
                    u_metric: isDrillDown && !metric ? "" : metric, // Pass empty if we just guessed win_rate
                    u_groupBy: groupBy.join(","),
                    u_threshold: threshold,
                    u_raw: text // pass full text so slot-resolver can find the new filter
                },
                confidence: 0.9
            };
        }

        return null;
    }

    classify(rawQuestion: string): ClassifierResult {
        const normalized = this.normalize(rawQuestion);

        if (this.hasRejectionKeywords(normalized)) {
            return { matched: false, reason: "Contains rejection keywords (e.g. why, compare, etc.)" };
        }

        const FILLER_WORDS_FOR_LEFTOVERS = [
            "please", "can you", "tell me", "show me", "what is", "whats", "what's", "are we", "is there", "do we", "give me", "i want to know", "the", "a", "an", "for", "in", "of", "on", "about", "to", "see", "look", "at", "could you", "would you", "display", "provide", "bring up", "find", "get", "explain", "describe", "all", "any", "some", "my", "our", "just", "quick", "quickly"
        ];

        let lastReason = "No template patterns matched.";

        for (const template of this.templates) {
            for (const pattern of template.patterns) {
                const match = normalized.match(pattern);
                
                if (match) {
                    const slots = match.groups || {};
                    const matchedString = match[0];
                    const leftover = normalized.replace(matchedString, "").trim();
                    
                    let cleanedLeftover = leftover;
                    const sortedFillers = [...FILLER_WORDS_FOR_LEFTOVERS].sort((a, b) => b.length - a.length);
                    for (const filler of sortedFillers) {
                        cleanedLeftover = cleanedLeftover.replace(new RegExp(`\\b${filler}\\b`, 'gi'), "").trim();
                    }
                    cleanedLeftover = cleanedLeftover.replace(/\s+/g, ' ').trim();

                    if (cleanedLeftover.length > 0 && cleanedLeftover.split(/\s+/).length > 4) {
                        lastReason = `Leftover words detected: "${leftover}" (cleaned: "${cleanedLeftover}")`;
                        continue;
                    }

                    return {
                        matched: true,
                        template_id: template.id,
                        slots,
                        confidence: 1.0
                    };
                }
            }
        }

        // Secondary Match Layer: Universal Extractor
        const universalMatch = this.extractUniversalComponents(normalized);
        if (universalMatch) {
            return universalMatch;
        }

        return { matched: false, reason: lastReason };
    }
}

export const globalClassifier = new Classifier();
