import { BusinessObjective } from "../BusinessObjective.js";
import { CapabilityType } from "../../ontology/types.js";

export const GeneralPerformance: BusinessObjective = {
    id: "general-performance",
    name: "General Performance Review",
    description: "Evaluates standard performance metrics for entities when no specific diagnostic or comparative intent is found.",
    triggers: {
        intents: ["SUMMARY", "BREAKDOWN"]
    },
    resolutionPlan: [
        {
            capability: CapabilityType.PERFORMANCE,
            purpose: "Evaluate core performance metrics",
            required: true
        }
    ],
    reportFramework: "PYRAMID_PRINCIPLE"
};
