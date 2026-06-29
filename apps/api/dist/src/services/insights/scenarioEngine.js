// ─── Scenario Engine ──────────────────────────────────────────────────────────
//
// Generates BEST_CASE / BASE_CASE / WORST_CASE scenario descriptions
// from deterministic analysis of risks and opportunities.
//
// Claude does NOT generate these. The backend does.
// ───────────────────────────────────────────────────────────────────────────────
export function generateScenarios(metricName, metricChange, risks, opportunities) {
    const scenarios = [];
    const topRisk = risks[0];
    const topOpp = opportunities[0];
    const isFlat = metricChange && Math.abs(metricChange.absoluteChange) < 0.5;
    const isDecline = metricChange && metricChange.direction === "decline";
    const isIncrease = metricChange && metricChange.direction === "increase";
    // ─── Best Case ────────────────────────────────────────────────────────────
    if (topOpp && topRisk) {
        scenarios.push({
            type: "BEST_CASE",
            description: `If ${topOpp.affectedEntity} momentum is replicated across additional segments ` +
                `and ${topRisk.affectedEntity} deterioration is resolved, ` +
                `overall ${metricName} is likely to improve.`
        });
    }
    else if (topOpp) {
        scenarios.push({
            type: "BEST_CASE",
            description: `If ${topOpp.affectedEntity} outperformance is sustained and scaled, ` +
                `${metricName} improvement will accelerate.`
        });
    }
    else {
        scenarios.push({
            type: "BEST_CASE",
            description: `If current positive trends continue without new headwinds, ` +
                `${metricName} stability will be maintained.`
        });
    }
    // ─── Base Case ────────────────────────────────────────────────────────────
    if (isFlat) {
        scenarios.push({
            type: "BASE_CASE",
            description: `Current ${metricName} stability persists, but underlying volatility ` +
                `remains elevated. Offsetting gains and losses continue to mask true performance.`
        });
    }
    else if (isDecline) {
        scenarios.push({
            type: "BASE_CASE",
            description: `${metricName} continues its current decline trajectory at a moderate pace. ` +
                `Without intervention, the downward trend is expected to persist.`
        });
    }
    else if (isIncrease) {
        scenarios.push({
            type: "BASE_CASE",
            description: `${metricName} improvement continues at the current rate, ` +
                `sustained by existing positive contributors.`
        });
    }
    else {
        scenarios.push({
            type: "BASE_CASE",
            description: `Current performance trajectory continues with no material change.`
        });
    }
    // ─── Worst Case ───────────────────────────────────────────────────────────
    if (topOpp && topRisk) {
        scenarios.push({
            type: "WORST_CASE",
            description: `If ${topOpp.affectedEntity} momentum slows while ${topRisk.affectedEntity} ` +
                `weakness continues, overall ${metricName} is likely to deteriorate significantly.`
        });
    }
    else if (topRisk) {
        scenarios.push({
            type: "WORST_CASE",
            description: `If ${topRisk.affectedEntity} deterioration accelerates without mitigation, ` +
                `${metricName} could face material decline.`
        });
    }
    else {
        scenarios.push({
            type: "WORST_CASE",
            description: `If unexpected headwinds emerge in key segments, ` +
                `${metricName} could come under significant downward pressure.`
        });
    }
    return scenarios;
}
