import { QuestionAnalysis } from "../questionTypes.js";
import { EnrichedSemanticLayer } from "../semanticLayer.js";
import { routeQuery, RoutingDecision } from "../queryRouter.js";

export interface ExecutionResult {
    route: RoutingDecision;
    analysis: QuestionAnalysis;
}

export class ExecutionEngine {

    execute(
        analysis: QuestionAnalysis,
        semanticLayer: EnrichedSemanticLayer
    ): ExecutionResult[] {

        const routes: RoutingDecision[] = [];

        // Existing deterministic route
        routes.push(routeQuery(analysis, semanticLayer));

        // ----------------------------
        // Multi-analysis enrichment
        // ----------------------------

        if (
            analysis.intent === "ROOT_CAUSE" &&
            !routes.some(r => r.type === "CONTRIBUTION")
        ) {
            routes.push({
                type: "CONTRIBUTION"
            } as RoutingDecision);
        }

        if (
            analysis.intent === "COMPARISON" &&
            analysis.timeReferences.length > 0 &&
            !routes.some(r => r.type === "TREND")
        ) {
            routes.push({
                type: "TREND"
            } as RoutingDecision);
        }

        if (
            analysis.intent === "SUMMARY" &&
            analysis.filters.length > 0 &&
            !routes.some(r => r.type === "CONTRIBUTION")
        ) {
            routes.push({
                type: "CONTRIBUTION"
            } as RoutingDecision);
        }

        return routes.map(route => ({
            route,
            analysis
        }));
    }
}

export const executionEngine = new ExecutionEngine();