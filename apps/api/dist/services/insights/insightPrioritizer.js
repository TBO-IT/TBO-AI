// src/services/analytics/insights/insightPrioritizer.ts
/**
 * Executive impact score.
 *
 * We want to prioritize entities that:
 * 1. Moved the overall metric materially
 * 2. Have meaningful volume share
 * 3. Experienced significant performance change
 *
 * Formula:
 * impactScore =
 *     |weightedContribution|
 *     × max(volumeSharePct, 0.1)
 *     × max(|metricDelta|, 1)
 */
function calculateImpactScore(entry) {
    return (Math.abs(entry.weightedContribution) *
        Math.max(entry.volumeSharePct, 0.1) *
        Math.max(Math.abs(entry.metricDelta), 1));
}
/**
 * Converts positive and negative contributors into a single
 * ranked executive-priority list.
 */
export function prioritizeInsights(positives, negatives, maxResults = 10) {
    const combined = [
        ...positives.map(entry => ({
            ...entry,
            direction: "POSITIVE",
            impactScore: calculateImpactScore(entry),
            priorityRank: 0
        })),
        ...negatives.map(entry => ({
            ...entry,
            direction: "NEGATIVE",
            impactScore: calculateImpactScore(entry),
            priorityRank: 0
        }))
    ];
    const ranked = combined
        .sort((a, b) => b.impactScore - a.impactScore)
        .slice(0, maxResults)
        .map((entry, index) => ({
        ...entry,
        priorityRank: index + 1
    }));
    console.log(`[InsightPrioritizer] Ranked ${ranked.length} priority drivers`);
    if (ranked.length > 0) {
        console.log("[InsightPrioritizer] Top Drivers:", ranked.slice(0, 5).map(driver => ({
            rank: driver.priorityRank,
            name: driver.name,
            direction: driver.direction,
            impactScore: Number(driver.impactScore.toFixed(2)),
            contributionPct: Number(driver.contributionPct.toFixed(2)),
            volumeSharePct: Number(driver.volumeSharePct.toFixed(2)),
            metricDelta: Number(driver.metricDelta.toFixed(2))
        })));
    }
    return ranked;
}
/**
 * Returns only the most important positive drivers.
 */
export function getTopPositiveDrivers(drivers, count = 5) {
    return drivers
        .filter(d => d.direction === "POSITIVE")
        .slice(0, count);
}
/**
 * Returns only the most important negative drivers.
 */
export function getTopNegativeDrivers(drivers, count = 5) {
    return drivers
        .filter(d => d.direction === "NEGATIVE")
        .slice(0, count);
}
