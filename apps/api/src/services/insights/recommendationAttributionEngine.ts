import { ActionabilityTarget } from "./actionabilityEngine.js";
import { DrilldownInsight } from "./entityDrilldownEngine.js";

export interface RecommendationTarget {
    targetType: "CHAIN" | "HOTEL" | "DESTINATION" | "SUPPLIER" | "APW" | "UNKNOWN";
    targetName: string;
    reason: string;
    expectedImpact: string;
    impactScore?: number;
}

export function generateAttributedRecommendations(
    primaryTarget: ActionabilityTarget | undefined,
    drilldowns: DrilldownInsight[],
    competitorContext?: { competitorName: string; sourceColumn: string }
): RecommendationTarget[] {
    const recommendations: RecommendationTarget[] = [];

    if (!primaryTarget) return recommendations;

    // 1. Primary Recommendation based on the root target
    const isNegative = primaryTarget.impactScore < 0;
    
    recommendations.push({
        targetType: primaryTarget.entityType,
        targetName: primaryTarget.name,
        reason: primaryTarget.reason,
        expectedImpact: isNegative 
            ? `Highest ROI recovery opportunity. Fixing this recovers up to ${Math.abs(primaryTarget.metricDelta).toFixed(2)} pts in a segment with ${primaryTarget.volumeShare.toFixed(1)}% volume.`
            : `Highest ROI growth opportunity. Scaling this amplifies a ${primaryTarget.metricDelta.toFixed(2)} pt advantage across ${primaryTarget.volumeShare.toFixed(1)}% volume.`,
        impactScore: primaryTarget.impactScore
    });

    // 2. Specific Recommendations based on drilldowns
    // For each drilldown, we recommend a targeted action
    if (!drilldowns?.length) {
        console.warn("[ATTRIBUTION_ENGINE] drilldowns array is empty or undefined");
        return recommendations;
    }

    for (const drilldown of drilldowns) {
        let actionReason = "";
        if (drilldown.impactScore < 0) {
            if (drilldown.entityType === "HOTEL" || drilldown.entityType === "CHAIN") {
                actionReason = `Audit pricing and inventory competitiveness for ${drilldown.name} specifically within ${primaryTarget.name}.`;
            } else if (drilldown.entityType === "SUPPLIER") {
                actionReason = `Review mapping and API latency for ${drilldown.name} impacting ${primaryTarget.name}.`;
            } else {
                actionReason = `Investigate localized market conditions for ${drilldown.name} impacting ${primaryTarget.name}.`;
            }
        } else {
            actionReason = `Leverage strong performance of ${drilldown.name} to cross-sell or expand inventory within ${primaryTarget.name}.`;
        }

        recommendations.push({
            targetType: drilldown.entityType as any,
            targetName: drilldown.name,
            reason: drilldown.reason,
            expectedImpact: actionReason,
            impactScore: drilldown.impactScore
        });
    }

    // Phase 4: Recommendation Hierarchy
    // Priority Order: Negative (vulnerabilities) -> Positive (strengths)
    const primary = recommendations[0];
    const rest = recommendations.slice(1).sort((a, b) => (a.impactScore || 0) - (b.impactScore || 0));

    return [primary, ...rest];
}
