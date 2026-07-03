import { AnalysisDefinition } from "../analysis/AnalysisDefinition.js";

/**
 * Represents a single analysis that has been scheduled for execution
 * as part of a larger Business Objective resolution plan.
 */
export interface PlannedAnalysis {
    /** The 1-based order of execution for this analysis */
    order: number;

    /** The specific analysis definition selected to fulfill the capability */
    analysis: AnalysisDefinition;

    /** Why this specific analysis was selected / what capability it fulfills */
    purpose: string;
}
