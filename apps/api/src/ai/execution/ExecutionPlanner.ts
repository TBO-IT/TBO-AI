import { QuestionAnalysis } from "../questionTypes.js";
import { EnrichedSemanticLayer } from "../semanticLayer.js";
import { ExecutionTask } from "./ExecutionTask.js";
import { routeQuery } from "../queryRouter.js";

export class ExecutionPlanner {

    plan(
        analysis: QuestionAnalysis,
        semanticLayer: EnrichedSemanticLayer
    ): ExecutionTask[] {

        const routes = [];

        // TODO:
        // This will become multi-route later.
        // For now reuse existing router.

        routes.push(routeQuery(
            analysis,
            semanticLayer
        ));

        return routes.map((route, index) => ({
            id: `task-${index + 1}`,
            route,
            question: analysis,
            priority: index,
            purpose: route.type
        }));
    }
}

export const executionPlanner = new ExecutionPlanner();