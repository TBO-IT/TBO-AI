import { AnalysisDefinition } from "../AnalysisDefinition.js";
import { AnalysisType } from "../types.js";
import { CapabilityType } from "../../ontology/types.js";

export const RiskAnalysis: AnalysisDefinition = {

    id: "risk-analysis",

    name: "Risk Analysis",

    description:
        "Identifies potential business risks that may affect future performance.",

    type: AnalysisType.RISK,

    capability: CapabilityType.PRIORITIZE,

    requiredMetrics: [
        {
            metricId: "trend",
            required: true,
            purpose: "Identify deteriorating patterns."
        },
        {
            metricId: "price_gap",
            required: true,
            purpose: "Detect pricing risk."
        }
    ],

    optionalMetrics: [
        {
            metricId: "confidence",
            required: false,
            purpose: "Assess certainty of identified risks."
        }
    ],

    producesInsights: [
        "Risk Assessment",
        "Priority Ranking",
        "Mitigation Opportunities"
    ]
};