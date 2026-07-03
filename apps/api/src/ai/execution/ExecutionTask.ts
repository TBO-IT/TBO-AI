import { RoutingDecision } from "../queryRouter.js";
import { QuestionAnalysis } from "../questionTypes.js";

export interface ExecutionTask {
    id: string;

    route: RoutingDecision;

    purpose: string;

    question: QuestionAnalysis;

    priority: number;
}