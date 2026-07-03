import { BusinessObjective } from "../BusinessObjective.js";
import { CapabilityType } from "../../ontology/types.js";

export const RiskAssessment: BusinessObjective = {
    id: "risk-assessment",
    name: "Risk Assessment",
    description: "Identifies anomalies and potential business risks, prioritizing them by impact.",
    triggers: {
        intents: ["ANOMALY", "EXECUTIVE_PRIORITY"]
    },
    resolutionPlan: [
        {
            capability: CapabilityType.DIAGNOSE,
            purpose: "Diagnose the primary risk drivers in the dataset",
            required: true
        },
        {
            capability: CapabilityType.PRIORITIZE,
            purpose: "Rank the identified risks by business impact",
            required: true
        }
    ],
    reportFramework: "SWOT"
};
