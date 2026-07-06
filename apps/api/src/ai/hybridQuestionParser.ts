import { LlmAnalysisResult, llmParseQuestion } from "./llmQuestionParser.js";
import { EnrichedSemanticLayer } from "./semanticLayer.js";
import { DatasetMetadata } from "../services/metadataService.js";

/**
 * Escapes special regex characters in a string
 */
function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
}

/**
 * Attempts to parse simple questions locally to save LLM costs.
 * If the question is complex (e.g. "why", "what should I do", multiple entities,
 * or unrecognized elements), it falls back to Claude.
 */
export async function hybridParseQuestion(
    question: string,
    semanticLayer: EnrichedSemanticLayer,
    metadata: DatasetMetadata
): Promise<LlmAnalysisResult> {
    const qLower = question.toLowerCase();

    // 1. Check for complex intents that require LLM
    const complexKeywords = ["why", "cause", "reason", "should", "recommend", "improve", "fix", "action", "strategy", "compare", "vs"];
    if (complexKeywords.some(kw => qLower.includes(kw))) {
        console.log("[HYBRID_PARSER] Complex intent detected, falling back to LLM.");
        return await llmParseQuestion(question, semanticLayer);
    }

    const filters: { dimension: string; operator: "ILIKE" | "="; value: string | number }[] = [];
    const metrics: string[] = [];
    const dimensions: string[] = [];
    let intent = "SUMMARY"; // default

    // 2. Extract Entities from Metadata
    const entityMaps = [
        { dim: "destination", values: metadata.destinations },
        { dim: "supplier", values: metadata.suppliers },
        { dim: "thirdparty", values: metadata.thirdParties },
        { dim: "chain", values: metadata.chains },
        { dim: "hotel", values: metadata.hotels },
        { dim: "country", values: metadata.countries },
        { dim: "apw", values: metadata.apwBuckets }
    ];

    let foundEntityCount = 0;
    for (const map of entityMaps) {
        if (!map.values) continue;
        for (const val of map.values) {
            if (!val) continue;
            const valStr = String(val);
            // check exact word match to avoid partial matches
            const regex = new RegExp(`\\b${escapeRegExp(valStr.toLowerCase())}\\b`, 'i');
            if (regex.test(qLower)) {
                filters.push({
                    dimension: map.dim,
                    operator: "ILIKE",
                    value: valStr
                });
                foundEntityCount++;
                // Only allow one exact match per dimension type to keep it simple
                break;
            }
        }
    }

    // 3. Extract Metrics
    const metricSynonyms: Record<string, string[]> = {
        "win_rate": ["win rate", "win percentage", "winning"],
        "price_competitiveness": ["price competitiveness", "price comp", "price difference", "gap"],
        "volume": ["volume", "searches", "count", "total"]
    };

    for (const metricKey of semanticLayer.metricKeys) {
        const synonyms = metricSynonyms[metricKey] || [metricKey.replace(/_/g, " ")];
        if (synonyms.some(s => qLower.includes(s))) {
            metrics.push(metricKey);
        }
    }
    
    // If no explicit metric is found but it's a simple query, default to win_rate if available
    if (metrics.length === 0 && semanticLayer.metricKeys.includes("win_rate")) {
        metrics.push("win_rate");
    }

    // 4. Extract Explicit Dimensions (e.g. "by hotel", "by supplier")
    const dimKeywords = ["by", "per", "across", "top", "bottom"];
    for (const dim of semanticLayer.dimensions) {
        for (const kw of dimKeywords) {
            if (qLower.includes(`${kw} ${dim.toLowerCase()}`)) {
                dimensions.push(dim);
            }
        }
    }

    // 5. Determine Intent
    if (qLower.includes("trend") || qLower.includes("over time") || qLower.includes("history")) {
        intent = "TREND";
    } else if (qLower.includes("top") || qLower.includes("bottom") || qLower.includes("worst") || qLower.includes("best")) {
        intent = "RANKING";
    } else if (dimensions.length > 0) {
        intent = "LIST";
    }

    // 6. Confidence Check
    // If we extracted at least one entity and one metric, and there are no unknown parts, we can return.
    // For simple queries like "win rate in dubai", foundEntityCount = 1, metrics.length >= 1.
    if (metrics.length > 0 && foundEntityCount <= 2 && intent !== "UNKNOWN") {
        console.log(`[HYBRID_PARSER] Confidently parsed simple query: intent=${intent} | metric=${metrics[0]} | filters=${filters.length}`);
        return {
            intent,
            metrics,
            dimensions,
            filters,
            timeReferences: [],
            focus: dimensions[0] || filters[0]?.dimension || "overall",
            requiresNarrative: false,
            requiresRecommendation: false,
            originalQuestion: question
        };
    }

    // 7. Fallback
    console.log("[HYBRID_PARSER] Could not confidently parse locally, falling back to LLM.");
    return await llmParseQuestion(question, semanticLayer);
}
