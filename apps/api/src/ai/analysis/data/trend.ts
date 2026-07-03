import { AnalysisDefinition } from "../AnalysisDefinition.js";
import { AnalysisType } from "../types.js";
import { CapabilityType } from "../../ontology/types.js";

export const TrendAnalysis: AnalysisDefinition = {

    id: "trend-analysis",

    name: "Trend Analysis",

    description:
        "Evaluates changes in business metrics over time.",

    type: AnalysisType.TREND,

    capability: CapabilityType.EXPLAIN,

    requiredMetrics: [
        {
            metricId: "trend",
            required: true,
            purpose: "Measure directional movement."
        },
        {
            metricId: "win_rate",
            required: true,
            purpose: "Track competitiveness over time."
        }
    ],

    optionalMetrics: [],

    producesInsights: [
        "Trend Direction",
        "Acceleration",
        "Decline",
        "Momentum"
    ]
};