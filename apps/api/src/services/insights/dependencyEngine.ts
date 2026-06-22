// ─── Dependency Engine ────────────────────────────────────────────────────────
//
// Identifies how much performance depends on the top contributors.
// Surfaces concentration dependency for executive awareness.
//
// Deterministic. Claude does NOT generate these.
// ───────────────────────────────────────────────────────────────────────────────

import { PrioritizedInsight } from "./insightPrioritizer.js";

export interface DependencyInsight {
    entities: string[];
    explanation: string;
}

export function detectDependencies(
    drivers: PrioritizedInsight[]
): DependencyInsight[] {
    const insights: DependencyInsight[] = [];

    if (drivers.length === 0) {
        return insights;
    }

    // ─── Primary dependency: Top 3 contributors ─────────────────────────────

    const top3 = drivers.slice(0, 3);
    const top3Names = top3.map(d => d.name);

    const totalContribution = drivers.reduce(
        (sum, d) => sum + Math.abs(d.contributionPct), 0
    );

    const top3Contribution = top3.reduce(
        (sum, d) => sum + Math.abs(d.contributionPct), 0
    );

    const top3SharePct = totalContribution > 0
        ? (top3Contribution / totalContribution * 100).toFixed(0)
        : "0";

    const top3VolumeShare = top3.reduce(
        (sum, d) => sum + d.volumeSharePct, 0
    ).toFixed(1);

    insights.push({
        entities: top3Names,
        explanation:
            `${top3Names.join(", ")} account for ${top3SharePct}% of total performance ` +
            `movement and represent ${top3VolumeShare}% of total volume. ` +
            `Performance outcomes are heavily dependent on these entities.`
    });

    // ─── Secondary: Single-entity dominance ─────────────────────────────────

    const topDriver = drivers[0];
    if (topDriver && Math.abs(topDriver.contributionPct) >= 30) {
        insights.push({
            entities: [topDriver.name],
            explanation:
                `${topDriver.name} alone accounts for ${Math.abs(topDriver.contributionPct).toFixed(1)}% ` +
                `of total performance movement. This single-entity dependency ` +
                `creates material risk if conditions change.`
        });
    }

    // ─── Tertiary: Directional imbalance ────────────────────────────────────

    const positiveCount = drivers.filter(d => d.direction === "POSITIVE").length;
    const negativeCount = drivers.filter(d => d.direction === "NEGATIVE").length;

    if (positiveCount > 0 && negativeCount > 0) {
        const ratio = negativeCount > positiveCount
            ? `${negativeCount} negative vs. ${positiveCount} positive`
            : `${positiveCount} positive vs. ${negativeCount} negative`;

        insights.push({
            entities: drivers.map(d => d.name),
            explanation:
                `Performance is driven by ${ratio} contributors. ` +
                `The balance of directional forces determines overall trajectory.`
        });
    }

    return insights.slice(0, 3);
}
