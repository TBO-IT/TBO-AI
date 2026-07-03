import { BusinessObjective } from "../BusinessObjective.js";
import { CapabilityType } from "../../ontology/types.js";

export const CompetitiveBenchmarking: BusinessObjective = {
    id: "competitive-benchmarking",
    name: "Competitive Benchmarking",
    description: "Compares business entities against each other and explains the performance gaps.",
    triggers: {
        intents: ["COMPARISON", "COMPARE_ENTITIES", "RANKING"]
    },
    resolutionPlan: [
        {
            capability: CapabilityType.COMPARE,
            purpose: "Benchmark entities across key performance metrics",
            required: true
        },
        {
            capability: CapabilityType.EXPLAIN,
            purpose: "Explain the variance in performance between entities",
            required: false
        }
    ],
    reportFramework: "MECE_TREE"
};
