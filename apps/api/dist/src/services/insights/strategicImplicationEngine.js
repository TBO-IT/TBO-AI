export function generateStrategicImplications(metricChange, drivers, risks, opportunities) {
    const implications = [];
    // Pattern 1: Metric flat BUT High volatility
    const isFlat = metricChange && Math.abs(metricChange.absoluteChange) < 0.5;
    const hasLargeMovements = drivers.some(d => Math.abs(d.metricDelta) >= 3);
    if (isFlat && hasLargeMovements) {
        implications.push({
            severity: "HIGH",
            implication: "Performance stability is being maintained by offsetting gains and losses."
        });
    }
    // Pattern 2: Few entities driving performance
    const top2ContributorsVolume = drivers.slice(0, 2).reduce((sum, d) => sum + d.volumeSharePct, 0);
    const totalVolume = drivers.reduce((sum, d) => sum + d.volumeSharePct, 0);
    if (drivers.length > 0 && top2ContributorsVolume / totalVolume > 0.6) {
        implications.push({
            severity: "HIGH",
            implication: "Performance is increasingly dependent on a small number of contributors."
        });
    }
    // Pattern 3: High concentration
    const hasHighConcentration = risks.some(r => r.category === "CONCENTRATION");
    if (hasHighConcentration) {
        implications.push({
            severity: "HIGH",
            implication: "Business performance is vulnerable to deterioration in a single high-volume segment."
        });
    }
    // Pattern 4 & 5: Opportunity vs Risk comparison
    const riskImpact = risks.reduce((sum, r) => sum + r.impactScore, 0);
    const oppImpact = opportunities.reduce((sum, o) => sum + o.impactScore, 0);
    if (oppImpact > riskImpact * 1.5 && oppImpact > 10) {
        implications.push({
            severity: "MEDIUM",
            implication: "Growth opportunities currently outweigh downside risk."
        });
    }
    else if (riskImpact > oppImpact * 1.5 && riskImpact > 10) {
        implications.push({
            severity: "HIGH",
            implication: "Downside pressure exceeds identifiable growth opportunities."
        });
    }
    // Sort by severity
    const severityWeight = {
        HIGH: 3,
        MEDIUM: 2,
        LOW: 1
    };
    return implications
        .sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity])
        .slice(0, 3);
}
