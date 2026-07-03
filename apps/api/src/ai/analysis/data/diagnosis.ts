import { AnalysisDefinition } from "../AnalysisDefinition.js";
import { AnalysisType } from "../types.js";
import { CapabilityType } from "../../ontology/types.js";

export const DiagnosisAnalysis: AnalysisDefinition = {

    id: "diagnosis-analysis",

    name: "Diagnosis Analysis",

    description:
        "Determines likely causes behind observed business performance.",

    type: AnalysisType.DIAGNOSIS,

    capability: CapabilityType.DIAGNOSE,

    requiredMetrics: [
        {
            metricId: "trend",
            required: true,
            purpose: "Detect deterioration or improvement."
        },
        {
            metricId: "price_gap",
            required: true,
            purpose: "Evaluate pricing issues."
        },
        {
            metricId: "supplier_mix",
            required: false,
            purpose: "Identify supplier-related causes."
        }
    ],

    optionalMetrics: [
        {
            metricId: "confidence",
            required: false,
            purpose: "Increase confidence in diagnosis."
        }
    ],

    producesInsights: [
        "Likely Causes",
        "Business Risks",
        "Recommendations",
        "Supporting Evidence"
    ]
};