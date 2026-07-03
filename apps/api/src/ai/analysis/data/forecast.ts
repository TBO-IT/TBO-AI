import { AnalysisDefinition } from "../AnalysisDefinition.js";
import { AnalysisType } from "../types.js";
import { CapabilityType } from "../../ontology/types.js";

export const ForecastAnalysis: AnalysisDefinition = {

    id: "forecast-analysis",

    name: "Forecast Analysis",

    description:
        "Projects future business performance using historical trends.",

    type: AnalysisType.FORECAST,

    capability: CapabilityType.FORECAST,

    requiredMetrics: [
        {
            metricId: "trend",
            required: true,
            purpose: "Predict future movement."
        }
    ],

    optionalMetrics: [
        {
            metricId: "volume",
            required: false,
            purpose: "Improve forecast quality."
        }
    ],

    producesInsights: [
        "Forecast",
        "Expected Performance",
        "Confidence Range"
    ]
};