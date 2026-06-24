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

export enum TargetPolarity {
    POSITIVE = "POSITIVE",
    NEGATIVE = "NEGATIVE",
    RISK = "RISK"
}

export interface ActionabilityTarget {
    entityType: "CHAIN" | "HOTEL" | "DESTINATION" | "SUPPLIER" | "APW" | "UNKNOWN";
    name: string;
    volumeShare: number;
    metricDelta: number;
    impactScore: number;
    actionabilityScore: number;
    resourceAllocationScore: number;
    polarity: TargetPolarity;
    reason: string;
    selectionRationale: string;
}

function calculateResourceAllocationScore(
    entry: ContributorEntry,
    impactScore: number,
    intent: DecisionIntent
): number {
    const recoverableImpact = impactScore < 0 ? Math.abs(impactScore) : 0;
    const growthOpportunity = impactScore > 0 ? impactScore : 0;
    const actionability = Math.abs(impactScore);

    const concentrationPenalty =
        entry.volumeSharePct >= 25 ? entry.volumeSharePct * 0.45 :
            entry.volumeSharePct >= 15 ? entry.volumeSharePct * 0.25 :
                entry.volumeSharePct >= 10 ? entry.volumeSharePct * 0.15 :
                    0;

    const baseScore =
        (recoverableImpact * 0.45) +
        (entry.volumeSharePct * 0.25) +
        (actionability * 0.30) +
        (growthOpportunity * 0.20) -
        concentrationPenalty;

    switch (intent) {
        case DecisionIntent.FIX:
        case DecisionIntent.IMPROVE:
            return baseScore + (recoverableImpact * 0.75);
        case DecisionIntent.EXPAND:
            return baseScore + (growthOpportunity * 0.75);
        case DecisionIntent.PROTECT:
            return baseScore + concentrationPenalty + (entry.volumeSharePct * 0.20) + (recoverableImpact * 0.25);
        case DecisionIntent.COMPETE:
            return baseScore + (recoverableImpact * 0.35) + (growthOpportunity * 0.35);
        case DecisionIntent.PRIORITIZE:
        case DecisionIntent.EXPLAIN:
        default:
            return baseScore;
    }
}

function derivePolarity(
    impactScore: number,
    intent: DecisionIntent
): TargetPolarity {
    if (intent === DecisionIntent.PROTECT) {
        return TargetPolarity.RISK;
    }

    return impactScore < 0 ? TargetPolarity.NEGATIVE : TargetPolarity.POSITIVE;
}

function buildSelectionRationale(
    entry: ContributorEntry,
    impactScore: number,
    resourceAllocationScore: number,
    polarity: TargetPolarity,
    intent: DecisionIntent
): string {
    const volume = `${entry.volumeSharePct.toFixed(1)}% volume`;
    const delta = `${Math.abs(entry.metricDelta).toFixed(2)} pts`;

    if (polarity === TargetPolarity.RISK) {
        return `Selected because ${entry.name} carries the highest concentration risk for the current allocation decision. Reducing dependency here protects ${volume} and improves resilience.`;
    }

    if (polarity === TargetPolarity.NEGATIVE || intent === DecisionIntent.FIX || intent === DecisionIntent.IMPROVE) {
        return `Selected because recovering ${delta} across ${volume} yields the strongest resource allocation score (${resourceAllocationScore.toFixed(2)}), making this the highest ROI fix among the available options.`;
    }

    return `Selected because scaling ${entry.name} converts a ${delta} advantage across ${volume} into the strongest resource allocation score (${resourceAllocationScore.toFixed(2)}), making it the highest ROI growth choice.`;
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

        const polarity = derivePolarity(impactScore, intent);
        const resourceAllocationScore = calculateResourceAllocationScore(entry, impactScore, intent);
        const selectionRationale = buildSelectionRationale(entry, impactScore, resourceAllocationScore, polarity, intent);

        return {
            entityType: type,
            name: entry.name,
            volumeShare: entry.volumeSharePct,
            metricDelta: entry.metricDelta,
            impactScore: impactScore,
            actionabilityScore,
            resourceAllocationScore,
            polarity,
            reason
            ,selectionRationale
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
            sortedTargets = sortedTargets.sort((a, b) => b.resourceAllocationScore - a.resourceAllocationScore);
            break;
    }

    return sortedTargets.slice(0, 5);
}
