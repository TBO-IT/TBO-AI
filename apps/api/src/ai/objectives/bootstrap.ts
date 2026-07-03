import { ObjectiveRegistry } from "./ObjectiveRegistry.js";
import { ObjectiveSelector } from "./ObjectiveSelector.js";
import {
    GrowthDiagnosis,
    RiskAssessment,
    CompetitiveBenchmarking,
    GeneralPerformance
} from "./data/index.js";

export const objectiveRegistry = new ObjectiveRegistry();

// Register all objectives
objectiveRegistry.register(GrowthDiagnosis);
objectiveRegistry.register(RiskAssessment);
objectiveRegistry.register(CompetitiveBenchmarking);
objectiveRegistry.register(GeneralPerformance);

export const objectiveSelector = new ObjectiveSelector(objectiveRegistry);
