import { AnalysisDefinition } from "../AnalysisDefinition.js";
import { AnalysisType } from "../types.js";
import { CapabilityType } from "../../ontology/types.js";

export const ComparisonAnalysis: AnalysisDefinition = {

    id: "comparison-analysis",

    name: "Comparison Analysis",

    description:
        "Compares two or more business entities across common metrics.",

    type: AnalysisType.COMPARISON,

    capability: CapabilityType.COMPARE,

    requiredMetrics: [
        {
            metricId: "win_rate",
            required: true,
            purpose: "Compare competitiveness."
        },
        {
            metricId: "price_gap",
            required: true,
            purpose: "Compare pricing."
        },
        {
            metricId: "market_share",
            required: false,
            purpose: "Compare market position."
        }
    ],

    optionalMetrics: [],

    producesInsights: [
        "Ranking",
        "Performance Gap",
        "Opportunities",
        "Competitive Position"
    ]
};