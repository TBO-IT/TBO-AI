import { QuestionAnalysis } from "./questionTypes.js";
import { EnrichedSemanticLayer } from "./semanticLayer.js";
import { generateTemplatedSql } from "./sqlTemplateEngine.js";

export type RouteType = "TEMPLATE" | "LLM";

export type RoutingDecision = 
    | { type: "TEMPLATE"; route: "TEMPLATE"; sql: string; explanation: string }
    | { type: "LLM"; route: "LLM" };

/**
 * Intelligent Query Router
 * Decides whether a question is simple enough to bypass Claude and use a deterministic SQL template.
 */
export function routeQuery(
    analysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer
): RoutingDecision {
    
    const { intent, metrics, dimensions, filters, timeReferences } = analysis;

    console.log(`[ANALYSIS] Intent: ${intent} | Metrics: [${metrics.join(",")}] | Dims: [${dimensions.join(",")}] | Filters: [${filters.join(",")}] | Time: [${timeReferences.join(",")}]`);

    // Define explicit routing rules
    const templateIntents = ["SUMMARY", "RANKING", "BREAKDOWN", "COMPARISON"];
    
    if (templateIntents.includes(intent)) {
        console.log(`[ROUTE_DECISION] Intent classified as TEMPLATE (${intent})`);
        
        // Try to generate a deterministic template
        const templatedSql = generateTemplatedSql(analysis, semanticLayer);

        if (templatedSql) {
            console.log(`[ROUTE_DECISION] Successfully generated deterministic SQL via Template Engine.`);
            return { 
                type: "TEMPLATE",
                route: "TEMPLATE", 
                sql: templatedSql,
                explanation: "Auto-generated using deterministic templates for simple reporting." 
            };
        } else {
            console.warn(`[ROUTE_DECISION] Template engine returned null for TEMPLATE intent (${intent}). Forcing fallback to LLM, but this should be flagged.`);
            return { type: "LLM", route: "LLM" };
        }
    }

    // Default to LLM for ROOT_CAUSE, CORRELATION, ANOMALY, etc.
    console.log(`[ROUTE_DECISION] Intent classified as LLM (${intent}). Routing to Claude.`);
    return { type: "LLM", route: "LLM" };
}
