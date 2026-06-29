// ─── Tradeoff Engine ──────────────────────────────────────────────────────────
//
// Detects situations where opportunity and risk overlap on the same entity.
// Surfaces executive tradeoffs that require leadership judgement.
//
// Deterministic. Claude does NOT generate these.
// ───────────────────────────────────────────────────────────────────────────────
export function detectTradeoffs(drivers, risks, opportunities) {
    const tradeoffs = [];
    const seen = new Set();
    // ─── Pattern 1: Same entity appears in both risks and opportunities ──────
    for (const opp of opportunities) {
        const matchingRisk = risks.find(r => r.affectedEntity === opp.affectedEntity);
        if (matchingRisk && !seen.has(opp.affectedEntity)) {
            seen.add(opp.affectedEntity);
            tradeoffs.push({
                title: `${opp.affectedEntity}: Growth vs. Risk`,
                explanation: `${opp.affectedEntity} is simultaneously our strongest growth driver ` +
                    `and our largest concentration exposure. Scaling investment increases ` +
                    `both upside potential and dependency risk.`
            });
        }
    }
    // ─── Pattern 2: High-growth entity with low volume share ─────────────────
    //     Growth is real but scaling it increases concentration
    for (const driver of drivers) {
        if (driver.direction === "POSITIVE" &&
            driver.metricDelta >= 5 &&
            driver.volumeSharePct < 5 &&
            !seen.has(driver.name)) {
            seen.add(driver.name);
            tradeoffs.push({
                title: `${driver.name}: Outperformance vs. Scale`,
                explanation: `${driver.name} growth is improving performance, but increasing ` +
                    `investment may not sustain the same rate of return at larger scale.`
            });
        }
    }
    // ─── Pattern 3: Concentration risk on a positive performer ───────────────
    for (const risk of risks) {
        if (risk.category === "CONCENTRATION" && !seen.has(risk.affectedEntity)) {
            const isPositive = drivers.find(d => d.name === risk.affectedEntity && d.direction === "POSITIVE");
            if (isPositive) {
                seen.add(risk.affectedEntity);
                tradeoffs.push({
                    title: `${risk.affectedEntity}: Dependency vs. Performance`,
                    explanation: `${risk.affectedEntity} is a strong performer, but high volume ` +
                        `concentration means any future deterioration would ` +
                        `have outsized impact on overall results.`
                });
            }
        }
    }
    return tradeoffs.slice(0, 3);
}
