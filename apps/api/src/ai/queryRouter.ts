import { QuestionAnalysis } from "./questionTypes.js";
import { EnrichedSemanticLayer } from "./semanticLayer.js";
import { generateTemplatedSql } from "./sqlTemplateEngine.js";

export type RoutingDecision = 
    | { route: "TEMPLATE"; sql: string; explanation: string }
    | { route: "LLM" };

/**
 * Intelligent Query Router
 * Decides whether a question is simple enough to bypass Claude and use a deterministic SQL template.
 */
export function routeQuery(
    analysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer
): RoutingDecision {
    
    const { intent } = analysis;

    // Complex intents that require reasoning, correlations, or root cause analysis
    // MUST always go to the LLM.
    const complexIntents = ["ROOT_CAUSE", "CORRELATION", "ANOMALY"];
    
    if (complexIntents.includes(intent)) {
        console.log(`[QueryRouter] Routing to LLM (Complex Intent: ${intent})`);
        return { route: "LLM" };
    }

    // Try to generate a deterministic template
    const templatedSql = generateTemplatedSql(analysis, semanticLayer);

    if (templatedSql) {
        console.log(`[QueryRouter] Routing to TEMPLATE`);
        return { 
            route: "TEMPLATE", 
            sql: templatedSql,
            explanation: "Auto-generated using deterministic templates for simple reporting." 
        };
    }

    // Fallback: If template engine couldn't handle it (e.g. multiple metrics, dates, filters),
    // route to LLM.
    console.log(`[QueryRouter] Routing to LLM (Template engine unsupported)`);
    return { route: "LLM" };
}
