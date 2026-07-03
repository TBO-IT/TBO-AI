import { CapabilityType, ConceptType } from "../ontology/types.js";
import { QuestionIntent } from "../questionTypes.js";

/**
 * A single step in the resolution plan of a Business Objective.
 * It maps to a specific analytical Capability.
 */
export interface ResolutionStep {
    /** The capability required to satisfy this step (e.g., PERFORMANCE, DIAGNOSE) */
    capability: CapabilityType;

    /** Why this capability is needed in the context of the objective */
    purpose: string;

    /** Whether the objective fails if this capability cannot be resolved */
    required: boolean;
}

/**
 * The trigger conditions that determine if this objective applies.
 */
export interface ObjectiveTriggers {
    /** At least one of these intents must be detected */
    intents: QuestionIntent[];

    /** Optional: if specified, ALL of these concept types must be present in the context */
    requiredConceptTypes?: ConceptType[];
}

/**
 * A Business Objective represents the highest-level goal of the executive.
 * It is satisfied by executing a sequence of analytical capabilities.
 */
export interface BusinessObjective {
    id: string;

    name: string;

    description: string;

    /** The semantic triggers for this objective */
    triggers: ObjectiveTriggers;

    /** The sequence of capabilities required to fulfill this objective */
    resolutionPlan: ResolutionStep[];

    /** How the consulting engine should structure the final report */
    reportFramework: "PYRAMID_PRINCIPLE" | "MECE_TREE" | "SWOT";
}
