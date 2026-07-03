import { BusinessObjective } from "../objectives/BusinessObjective.js";
import { AnalysisPlan } from "./AnalysisPlan.js";
import { PlannedAnalysis } from "./PlannedAnalysis.js";
import { AnalysisRegistry } from "../analysis/AnalysisRegistry.js";

/**
 * The AnalysisPlanner converts a Business Objective into an ordered consulting workflow.
 * 
 * It determines which Analysis Definitions should be executed and in what order
 * to satisfy the capabilities required by the objective's resolution plan.
 */
export class AnalysisPlanner {
    constructor(private readonly analysisRegistry: AnalysisRegistry) {}

    /**
     * Converts a BusinessObjective into an AnalysisPlan.
     */
    createPlan(objective: BusinessObjective): AnalysisPlan {
        const plannedAnalyses: PlannedAnalysis[] = [];
        let currentOrder = 1;

        for (const step of objective.resolutionPlan) {
            // Find all analyses that provide the required capability
            const candidateAnalyses = this.analysisRegistry.getByCapability(step.capability);

            if (candidateAnalyses.length === 0) {
                if (step.required) {
                    throw new Error(`Cannot fulfill objective '${objective.id}': No registered analysis provides capability '${step.capability}'.`);
                }
                continue; // Skip optional steps if no analysis is available
            }

            // Select the best analysis (For now, we just pick the first one. 
            // Future extension: select based on dataset compatibility or score)
            const selectedAnalysis = candidateAnalyses[0];

            plannedAnalyses.push({
                order: currentOrder++,
                analysis: selectedAnalysis,
                purpose: step.purpose
            });
        }

        return {
            objectiveId: objective.id,
            objectiveName: objective.name,
            analyses: plannedAnalyses
        };
    }
}
