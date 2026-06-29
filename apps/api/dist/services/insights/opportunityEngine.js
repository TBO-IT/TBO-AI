// src/services/analytics/insights/opportunityEngine.ts
function inferCategory(entityName) {
    const lower = entityName.toLowerCase();
    if (lower.includes("day") ||
        lower.includes("days") ||
        lower.includes("apw")) {
        return "BOOKING_WINDOW";
    }
    return "PERFORMANCE";
}
function buildAction(category) {
    switch (category) {
        case "BOOKING_WINDOW":
            return "Replicate successful pricing and distribution tactics across adjacent booking windows.";
        case "SUPPLIER":
            return "Increase allocation and investigate supplier practices driving outperformance.";
        case "HOTEL":
            return "Benchmark against underperforming hotels and scale successful tactics.";
        case "CHAIN":
            return "Identify chain-level practices contributing to stronger conversion and replicate them.";
        case "EXPANSION":
            return "Expand investment into the highest-performing segment.";
        default:
            return "Investigate drivers of outperformance and replicate across similar segments.";
    }
}
function buildOpportunity(driver) {
    const category = inferCategory(driver.name);
    const severity = driver.volumeSharePct >= 15 ||
        driver.metricDelta >= 5
        ? "HIGH"
        : driver.volumeSharePct >= 5
            ? "MEDIUM"
            : "LOW";
    return {
        title: `${driver.name} expansion opportunity`,
        severity,
        category,
        affectedEntity: driver.name,
        impactScore: Number(driver.impactScore.toFixed(2)),
        explanation: `${driver.name} improved by ` +
            `${driver.metricDelta.toFixed(2)} points ` +
            `while representing ` +
            `${driver.volumeSharePct.toFixed(1)}% of total volume.`,
        recommendedAction: buildAction(category)
    };
}
function buildMomentumOpportunity(driver) {
    return {
        title: `${driver.name} momentum acceleration opportunity`,
        severity: "HIGH",
        category: inferCategory(driver.name),
        affectedEntity: driver.name,
        impactScore: Number((driver.impactScore * 1.2).toFixed(2)),
        explanation: `${driver.name} is demonstrating strong positive momentum ` +
            `with a ${driver.metricDelta.toFixed(2)} point improvement ` +
            `and meaningful contribution to overall performance.`,
        recommendedAction: "Prioritize investment and investigate opportunities to scale this performance across other segments."
    };
}
function buildScaleOpportunity(driver) {
    return {
        title: `${driver.name} scale-up opportunity`,
        severity: "HIGH",
        category: "EXPANSION",
        affectedEntity: driver.name,
        impactScore: Number(driver.impactScore.toFixed(2)),
        explanation: `${driver.name} is performing strongly despite limited volume share (${driver.volumeSharePct.toFixed(1)}%).`,
        recommendedAction: "Increase exposure and test whether strong performance can be sustained at larger scale."
    };
}
export function detectOpportunities(priorityDrivers) {
    const opportunities = [];
    for (const driver of priorityDrivers) {
        if (driver.direction !== "POSITIVE") {
            continue;
        }
        // --------------------------------------------------
        // RULE 1
        // Meaningful positive performance
        // --------------------------------------------------
        const meaningfulUpside = driver.volumeSharePct >= 5 ||
            driver.metricDelta >= 3;
        if (meaningfulUpside) {
            opportunities.push(buildOpportunity(driver));
        }
        // --------------------------------------------------
        // RULE 2
        // Strong momentum
        // --------------------------------------------------
        if (driver.metricDelta >= 5 &&
            driver.volumeSharePct >= 5) {
            opportunities.push(buildMomentumOpportunity(driver));
        }
        // --------------------------------------------------
        // RULE 3
        // High performance but under-scaled
        // --------------------------------------------------
        if (driver.metricDelta >= 5 &&
            driver.volumeSharePct < 5) {
            opportunities.push(buildScaleOpportunity(driver));
        }
    }
    const severityWeight = {
        HIGH: 3,
        MEDIUM: 2,
        LOW: 1
    };
    const deduped = opportunities.filter((opp, index, self) => index ===
        self.findIndex(o => o.title === opp.title &&
            o.affectedEntity === opp.affectedEntity));
    const sorted = deduped
        .sort((a, b) => {
        const severityDiff = severityWeight[b.severity] -
            severityWeight[a.severity];
        if (severityDiff !== 0) {
            return severityDiff;
        }
        return b.impactScore - a.impactScore;
    })
        .slice(0, 10);
    console.log("[OPPORTUNITY_ENGINE]", sorted.map(o => ({
        severity: o.severity,
        title: o.title,
        impactScore: o.impactScore
    })));
    return sorted;
}
