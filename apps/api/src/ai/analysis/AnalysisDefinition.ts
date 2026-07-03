import { AnalysisType } from "./types.js";
import { CapabilityType } from "../ontology/types.js";
import { AnalysisRequirement } from "./AnalysisRequirement.js";

export interface AnalysisDefinition {

    id: string;

    name: string;

    description: string;

    type: AnalysisType;

    capability: CapabilityType;

    requiredMetrics: AnalysisRequirement[];

    optionalMetrics: AnalysisRequirement[];



    producesInsights: string[];
}