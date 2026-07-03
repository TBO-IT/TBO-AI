import { AnalysisPlan } from "../planning/AnalysisPlan.js";
import { AnalysisContext } from "../core/AnalysisContext.js";
import { EvidencePlan, UnifiedRequirement } from "./EvidencePlan.js";

export class EvidencePlanner {
    createPlan(input: AnalysisPlan | AnalysisContext): EvidencePlan {
        const requirementMap = new Map<string, UnifiedRequirement>();

        // Handle backward compatibility (AnalysisContext)
        if ('analysis' in input && !('analyses' in input)) {
            const context = input as AnalysisContext;
            const requirements = [
                ...context.analysis.requiredMetrics,
                ...context.analysis.optionalMetrics
            ].map(r => ({ ...r, requiredBy: [context.analysis.id] }));
            
            return {
                objectiveId: "legacy-context",
                requirements,
                estimatedQueries: requirements.length
            };
        }

        // Handle new architecture (AnalysisPlan)
        const analysisPlan = input as AnalysisPlan;
        
        // Traverse all PlannedAnalyses in order
        for (const plannedAnalysis of analysisPlan.analyses) {
            const analysis = plannedAnalysis.analysis;

            const allMetrics = [
                ...analysis.requiredMetrics,
                ...analysis.optionalMetrics
            ];

            for (const req of allMetrics) {
                const existing = requirementMap.get(req.metricId);

                if (existing) {
                    // Update existing requirement (merge deduplicated evidence)
                    existing.required = existing.required || req.required;
                    if (!existing.requiredBy.includes(analysis.id)) {
                        existing.requiredBy.push(analysis.id);
                    }
                    if (!existing.purpose.includes(req.purpose)) {
                         existing.purpose += " | " + req.purpose;
                    }
                } else {
                    // Add new requirement
                    requirementMap.set(req.metricId, {
                        metricId: req.metricId,
                        required: req.required,
                        purpose: req.purpose,
                        requiredBy: [analysis.id]
                    });
                }
            }
        }

        const requirements = Array.from(requirementMap.values());

        return {
            objectiveId: analysisPlan.objectiveId,
            requirements,
            // Grouping query opportunities: assuming we can batch metrics into unified queries
            // For now, a rough estimate could be 1 query per metric, or grouped entirely.
            // We'll estimate 1 query per distinct metric.
            estimatedQueries: requirements.length
        };
    }
}