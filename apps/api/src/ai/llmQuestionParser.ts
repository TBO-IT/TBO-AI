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
ROOT_CAUSE (e.g. "why did X drop?"), TREND ("how is X trending over time?"), PERFORMANCE ("show me performance of X"), COMPARISON ("compare X and Y"), CONTRIBUTION ("what drove the increase in X?"), COMPETITOR_STRATEGY ("what is Expedia doing?"), EXECUTIVE_PRIORITY ("what should I focus on?").

JSON SCHEMA TO RETURN:
{
  "intent": "string (from intent list)",
  "metrics": ["string (canonical metric keys)"],
  "dimensions": ["string (canonical dimension keys)"],
  "filters": [
    {
      "dimension": "string (canonical dimension key)",
      "operator": "ILIKE" | "=", 
      "value": "string or number (the filter value)"
    }
  ],
  "timeReferences": ["string (any time phrases like 'april', 'Q1', 'last week')"],
  "focus": "string (the primary dimension the user is focusing on)",
  "requiresNarrative": boolean (true if user asks for an 'executive summary', 'explanation', or 'write-up'),
  "requiresRecommendation": boolean (true if user asks 'what should we do', 'recommendations', 'how to improve')
}

RULES:
1. "filters" should contain any explicit constraints the user mentions. Use "ILIKE" for open-text names (like hotel or city names) and "=" for strict buckets (like APW).
2. "requiresNarrative" and "requiresRecommendation" determine if we should generate an AI summary AFTER the SQL query executes.
3. Be robust against typos. Map entities to the correct dimensions intelligently.
4. Output ONLY valid JSON. No markdown ticks, no preamble.`;

    const userPrompt = `Parse this user question into the JSON schema: "${question}"`;

    const result = await generateText(userPrompt, systemPrompt, "HAIKU", 1500, 0);

    try {
        const jsonStr = extractJsonBlock(result.text);
        const parsed = JSON.parse(jsonStr) as LlmAnalysisResult;
        
        logger.info({ parsed }, "LLM Question Parser result");
        
        // Ensure arrays exist
        parsed.metrics = parsed.metrics || [];
        parsed.dimensions = parsed.dimensions || [];
        parsed.filters = parsed.filters || [];
        parsed.timeReferences = parsed.timeReferences || [];
        parsed.originalQuestion = question;
        
        return parsed;
    } catch (e) {
        logger.error({ err: e, text: result.text }, "Failed to parse JSON from Claude NLU");
        throw new Error("Failed to parse user question. Please rephrase.");
    }
}
