import { AnalysisRequirement } from "../analysis/AnalysisRequirement.js";

export interface UnifiedRequirement extends AnalysisRequirement {
    /** 
     * The ordered list of analysis IDs that depend on this evidence.
     * Preserves execution priority.
     */
    requiredBy: string[];
}

export interface EvidencePlan {
    /** The Business Objective this plan supports */
    objectiveId: string;

    /** Deduplicated requirements across all planned analyses */
    requirements: UnifiedRequirement[];

    /** Estimated grouped queries */
    estimatedQueries: number;
}