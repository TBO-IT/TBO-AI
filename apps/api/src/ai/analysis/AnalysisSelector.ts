import { AnalysisRegistry } from "./AnalysisRegistry.js";
import { AnalysisDefinition } from "./AnalysisDefinition.js";
import { CapabilityType } from "../ontology/types.js";
import { QuestionAnalysis } from "../questionTypes.js";
import { QuestionIntent } from "../questionTypes.js";

export class AnalysisSelector {
    constructor(
        private readonly registry: AnalysisRegistry
    ) { }

    /**
     * Selects the most appropriate business analysis
     * based on the analyzed question.
     */
    select(
        question: QuestionAnalysis
    ): AnalysisDefinition {

        const capability = this.mapIntentToCapability(
            question.intent
        );

        const analyses =
            this.registry.getByCapability(capability);

        if (analyses.length === 0) {
            throw new Error(
                `No analysis registered for capability '${capability}'.`
            );
        }

        // For now return the first registered analysis.
        // Later this can rank multiple analyses.
        return analyses[0];
    }

    /**
     * Converts the NLP intent into a business capability.
     */
    private mapIntentToCapability(
        intent: QuestionIntent
    ): CapabilityType {

        switch (intent) {

            case "SUMMARY":
            case "BREAKDOWN":
                return CapabilityType.PERFORMANCE;

            case "COMPARISON":
            case "RANKING":
                return CapabilityType.COMPARE;

            case "TREND":
                return CapabilityType.EXPLAIN;

            case "ROOT_CAUSE":
            case "CONTRIBUTION":
                return CapabilityType.DIAGNOSE;

            case "EXECUTIVE_PRIORITY":
                return CapabilityType.PRIORITIZE;

            case "CORRELATION":
                return CapabilityType.EXPLAIN;

            case "ANOMALY":
                return CapabilityType.INVESTIGATE;

            default:
                return CapabilityType.PERFORMANCE;
        }
    }
}