import { BusinessObjective } from "./BusinessObjective.js";
import { ObjectiveRegistry } from "./ObjectiveRegistry.js";
import { QuestionAnalysis } from "../questionTypes.js";

export class ObjectiveSelector {
    constructor(private readonly registry: ObjectiveRegistry) {}

    /**
     * Selects the most appropriate Business Objective based on the analyzed question.
     */
    select(question: QuestionAnalysis): BusinessObjective {
        const intent = question.intent;
        
        // Find matching objective based on intent
        for (const objective of this.registry.getAll()) {
            if (objective.triggers.intents.includes(intent)) {
                // If it also requires concepts, verify them (simplification for Phase 1)
                // In a fuller implementation, we'd check if the concepts extracted map to the requiredConceptTypes.
                return objective;
            }
        }

        // Fallback to General Performance if no specific objective matches
        const fallback = this.registry.get("general-performance");
        if (fallback) {
            return fallback;
        }

        throw new Error("No applicable Business Objective found, and fallback is missing.");
    }
}
