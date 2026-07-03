import { PlannedAnalysis } from "./PlannedAnalysis.js";

/**
 * Represents the complete, ordered consulting workflow required to satisfy
 * a specific Business Objective.
 */
export interface AnalysisPlan {
    /** The ID of the Business Objective this plan fulfills */
    objectiveId: string;

    /** The name of the Business Objective */
    objectiveName: string;

    /** The ordered sequence of analyses to execute */
    analyses: PlannedAnalysis[];
}
