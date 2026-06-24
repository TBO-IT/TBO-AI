import { ContributorEntry } from "../../RootCausePackBuilder.js";

export enum DecisionIntent {
    EXPLAIN = "EXPLAIN",
    IMPROVE = "IMPROVE",
    FIX = "FIX",
    COMPETE = "COMPETE",
    PRIORITIZE = "PRIORITIZE",
    EXPAND = "EXPAND",
    PROTECT = "PROTECT"
}

export interface ActionabilityTarget {
    entityType: "CHAIN" | "HOTEL" | "DESTINATION" | "SUPPLIER" | "APW" | "UNKNOWN";
    name: string;
    volumeShare: number;
    metricDelta: number;
    impactScore: number;
    actionabilityScore: number;
    reason: string;
}

export function calculateActionabilityTargets(
    allContributors: { entry: ContributorEntry; type: ActionabilityTarget["entityType"] }[],
    intent: DecisionIntent = DecisionIntent.EXPLAIN,
    competitorContext?: { competitorName: string; sourceColumn: string }
): ActionabilityTarget[] {
    
    if (!allContributors?.length) {
        console.warn("[ACTIONABILITY_ENGINE] allContributors is empty or undefined");
        return [];
    }

    const targets: ActionabilityTarget[] = allContributors.map(({ entry, type }) => {
        // Business impact is essentially the weighted contribution to the overall metric
        const impactScore = entry.weightedContribution;
        
        // Actionability is driven by:
        // 1. How much the entity dragged down performance (huge negative impact = must fix)
        // 2. High volume entities that have minor drops are more actionable than tiny volume entities with huge drops
        // We use absolute weighted contribution as the base, but penalize tiny volumes
        
        let actionabilityScore = Math.abs(impactScore);
        
        // Penalize if volume share is extremely low (< 2%) as it's not a systemic needle-mover
        if (entry.volumeSharePct < 2) {
            actionabilityScore *= 0.2;
        }

        // Boost if it's a negative impact with high volume (classic bleeding segment)
        if (impactScore < 0 && entry.volumeSharePct > 10) {
            actionabilityScore *= 1.5;
        }

        let reason = "";
        const contextStr = competitorContext ? ` vs ${competitorContext.competitorName}` : "";

        if (impactScore < 0) {
            reason = `Largest negative contributor${contextStr} (${entry.metricDelta.toFixed(2)} pts at ${entry.volumeSharePct.toFixed(1)}% volume).`;
        } else {
            reason = `High-growth segment to scale${contextStr} (${entry.metricDelta.toFixed(2)} pts at ${entry.volumeSharePct.toFixed(1)}% volume).`;
        }

        return {
            entityType: type,
            name: entry.name,
            volumeShare: entry.volumeSharePct,
            metricDelta: entry.metricDelta,
            impactScore: impactScore,
            actionabilityScore,
            reason
        };
    });

    // Phase 2: Decision Target Selection
    let sortedTargets = [...targets];
    switch (intent) {
        case DecisionIntent.EXPLAIN:
            // Strongest explanatory driver (highest absolute actionability)
            sortedTargets = sortedTargets.sort((a, b) => b.actionabilityScore - a.actionabilityScore);
            break;
        case DecisionIntent.IMPROVE:
        case DecisionIntent.FIX:
        case DecisionIntent.COMPETE:
            // Largest negative contributor
            sortedTargets = sortedTargets.sort((a, b) => a.impactScore - b.impactScore);
            break;
        case DecisionIntent.EXPAND:
            // Strongest scalable positive
            sortedTargets = sortedTargets.sort((a, b) => b.impactScore - a.impactScore);
            break;
        case DecisionIntent.PROTECT:
            // Highest concentration risk (highest volume)
            sortedTargets = sortedTargets.sort((a, b) => b.volumeShare - a.volumeShare);
            break;
        case DecisionIntent.PRIORITIZE:
        default:
            // Highest ROI target
            sortedTargets = sortedTargets.sort((a, b) => b.actionabilityScore - a.actionabilityScore);
            break;
    }

    return sortedTargets.slice(0, 5);
}
