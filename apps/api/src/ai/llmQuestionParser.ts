import { QuestionAnalysis, QuestionIntent } from "./questionTypes.js";
import { generateText } from "../services/anthropicClient.js";
import { DIMENSION_REGISTRY } from "./dimensionRegistry.js";
import { logger } from "../lib/logger.js";
import { EnrichedSemanticLayer } from "./semanticLayer.js";

/**
 * Extended analysis payload returned by the LLM
 */
export interface LlmAnalysisResult extends QuestionAnalysis {
    requiresNarrative: boolean;
    requiresRecommendation: boolean;
}

/**
 * Extracts JSON from a potentially markdown-wrapped string
 */
function extractJsonBlock(text: string): string {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
        return jsonMatch[1];
    }
    const inlineMatch = text.match(/\{[\s\S]*\}/);
    if (inlineMatch) {
        return inlineMatch[0];
    }
    return text;
}

/**
 * Uses Claude to parse the user's natural language question into a structured JSON payload.
 * Completely replaces all legacy regex and string-matching logic.
 */
export async function llmParseQuestion(
    question: string,
    semanticLayer: EnrichedSemanticLayer
): Promise<LlmAnalysisResult> {
    
    // Build context strings for Claude to understand the domain based on actual schema!
    const validDimensions = semanticLayer.dimensions.map(dim => {
        const def = DIMENSION_REGISTRY[dim];
        if (def) {
            const valid = def.validValues ? `(Valid: ${def.validValues.join(", ")})` : "(Open text)";
            return `  - ${dim}: ${def.label} ${valid}`;
        }
        return `  - ${dim}: (Extracted directly from dataset column)`;
    }).join("\n");
        
    const validMetrics = semanticLayer.metricKeys.length > 0 
        ? semanticLayer.metricKeys.join(", ") 
        : "(No predefined metrics; dataset relies entirely on open text queries)";

    const systemPrompt = `You are an expert NLP parser for a travel analytics platform.
Your ONLY job is to extract business intent, metrics, dimensions, and filters from the user's natural language query.
You MUST output raw, valid JSON exactly matching the schema provided below. Do not add any conversational text.

AVAILABLE DIMENSIONS FOR THIS DATASET:
${validDimensions}

AVAILABLE METRICS FOR THIS DATASET:
${validMetrics}

AVAILABLE INTENTS:
- ROOT_CAUSE: (e.g. "why did X drop?", "what caused the decline in Bangkok?")
- TREND: ("how is X trending?", "win rate over time")
- RANKING: ("which is the best/worst X?", "top 5 destinations", "bottom chains by win rate", "which destination is the worst?")
- LIST: ("show me hotels in Dubai", "list suppliers with price diff < 3")
- SUMMARY: ("give me a summary of Dubai", "overview of our performance")
- PERFORMANCE: ("show me the performance of Pattaya" — only when asked about a named entity with no ranking intent)
- COMPARISON: ("compare X and Y")
- CONTRIBUTION: ("what drove the increase in X?")
- COMPETITOR_STRATEGY: ("what is Expedia doing?", "how can I win against Otilla?")
- EXECUTIVE_PRIORITY: ("what should I focus on?", "what are my top priorities?")

COMPOUND QUESTION RULE:
If the question combines a ranking/list with a recommendation (e.g. "which is the worst destination and what should I do to improve it?"), use RANKING as the intent AND set requiresRecommendation=true. Do NOT use EXECUTIVE_PRIORITY for this pattern.

JSON SCHEMA TO RETURN:
{
  "intent": "string (from intent list)",
  "metrics": ["string (canonical metric keys)"],
  "dimensions": ["string (canonical dimension keys)"],
  "filters": [
    {
      "dimension": "string (canonical dimension key)",
      "operator": "ILIKE" | "=" | "<" | ">" | "<=" | ">=" | "!=", 
      "value": "string or number (the filter value)"
    }
  ],
  "timeReferences": ["string (any time phrases like 'april', 'Q1', 'last week')"],
  "focus": "string (the primary dimension the user is focusing on)",
  "requiresNarrative": boolean (true if user asks for an 'executive summary', 'explanation', or 'write-up'),
  "requiresRecommendation": boolean (true if user asks 'what should we do', 'recommendations', 'how to improve')
}

RULES:
1. "filters" should contain ALL explicit constraints. Use "ILIKE" for open-text entity names (hotel name, destination, chain, competitor). Use "=" for exact categorical values (APW buckets, competitive status).
2. APW filter values must use EXACT bucket strings: '< 10 days', '11-30 days', '31-45 days', '46-60 days', '61-90 days', '90+ days'. Map natural language like "31-45" or "31-45 days" to the correct bucket.
3. Competitive status values: 'Winning', 'Losing', 'Equal'. If the user says "losing destinations" add filter {dimension:"competitive_status", operator:"=", value:"Losing"}.
4. For multi-filter questions ("win rate of marriott chain in dubai in apw 31-45"), extract ALL filters: chain=Marriott, destination=Dubai, apw=31-45 days.
5. For multi-part questions ("show me worst hotels AND the APW to focus on AND the worst competitor"), set intent to the primary analytical type (RANKING or LIST) and set requiresNarrative=true. The "dimensions" array should list all dimensions the user wants analyzed: e.g. ["hotel", "apw", "thirdparty"].
6. "requiresNarrative" = true if the answer needs explanation. "requiresRecommendation" = true if the user asks 'what should I do', 'how to improve', or 'what action to take'.
7. Be robust against typos. Map "marriot" → Marriott, "dubai" → Dubai, "31 45" → "31-45 days", etc.
8. Output ONLY valid JSON. No markdown ticks, no preamble.
9. If a question asks which entity (e.g. competitor, hotel, destination) is "hurting us the most", "driving the decline", or having the most negative impact, set requiresNarrative=true AND requiresRecommendation=true so that a full analytical report is generated.
10. If the user filters on a metric (e.g. "price gap > 5", "win rate below 50%"), add it to the filters array. Use the canonical metric key as the dimension, and the appropriate mathematical operator (<, >, <=, >=). Ensure the value is a number.`;

    const userPrompt = `Parse this user question into the JSON schema: "${question}"`;

    const result = await generateText(userPrompt, systemPrompt, "HAIKU", 500, 0);

    try {
        const jsonStr = extractJsonBlock(result.text);
        const parsed = JSON.parse(jsonStr) as LlmAnalysisResult;
        
        logger.info({ parsed }, "LLM Question Parser result");
        
        // Ensure arrays exist and contain no null/undefined elements
        parsed.metrics = (parsed.metrics || []).filter(Boolean);
        parsed.dimensions = (parsed.dimensions || []).filter(Boolean);
        parsed.filters = (parsed.filters || []).filter(Boolean);
        parsed.timeReferences = (parsed.timeReferences || []).filter(Boolean);
        parsed.originalQuestion = question;
        
        return parsed;
    } catch (e) {
        logger.error({ err: e, text: result.text }, "Failed to parse JSON from Claude NLU");
        throw new Error("Failed to parse user question. Please rephrase.");
    }
}
