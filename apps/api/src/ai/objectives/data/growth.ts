import { BusinessObjective } from "../BusinessObjective.js";
import { CapabilityType } from "../../ontology/types.js";

export const GrowthDiagnosis: BusinessObjective = {
    id: "growth-diagnosis",
    name: "Growth Diagnosis",
    description: "Evaluates the historical trend of an entity and attempts to diagnose the root causes of the movement. Triggered only for trend questions that also require diagnosis — i.e., 'What changed X and why?'",
    triggers: {
        // Only fires when the primary signal is a TIME-SERIES query (WoW, MoM, trend).
        // Pure ROOT_CAUSE questions (Why did X happen?) fall through to general-performance
        // so they use the existing ROOT_CAUSE single-engine pipeline.
        intents: ["TREND"]
    },
    resolutionPlan: [
        {
            capability: CapabilityType.EXPLAIN, // Trend explanation (TREND → EXPLAIN capability mapping)
            purpose: "Establish the baseline historical trend",
            required: true
        },
        {
            capability: CapabilityType.DIAGNOSE,
            purpose: "Identify the root cause of the trend",
            required: true
        }
    ],
    reportFramework: "PYRAMID_PRINCIPLE"
};
