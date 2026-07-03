import { AnalysisDefinition } from "../AnalysisDefinition.js";
import { AnalysisType } from "../types.js";
import { CapabilityType } from "../../ontology/types.js";

export const PerformanceAnalysis: AnalysisDefinition = {
    id: "performance-analysis",

    name: "Performance Analysis",

    description:
        "Evaluates how well a business entity is performing across key commercial metrics.",

    type: AnalysisType.PERFORMANCE,

    capability: CapabilityType.PERFORMANCE,

    requiredMetrics: [
        {
            metricId: "win_rate",
            required: true,
            purpose: "Measure pricing competitiveness."
        },
        {
            metricId: "price_gap",
            required: true,
            purpose: "Understand pricing position."
        },
        {
            metricId: "market_share",
            required: false,
            purpose: "Measure market presence."
        },
        {
            metricId: "volume",
            required: false,
            purpose: "Understand business scale."
        }
    ],

    optionalMetrics: [
        {
            metricId: "confidence",
            required: false,
            purpose: "Assess statistical confidence."
        }
    ],

    producesInsights: [
        "Executive Summary",
        "Performance Score",
        "Strengths",
        "Weaknesses",
        "Business Impact"
    ]
};