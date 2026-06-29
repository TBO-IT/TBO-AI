import { validateRootCausePack } from "./RootCausePackValidator.js";
import { prioritizeInsights } from "./insights/insightPrioritizer.js";
import { detectRisks } from "./insights/riskEngine.js";
import { detectOpportunities } from "./insights/opportunityEngine.js";
import { calculateActionabilityTargets, DecisionIntent } from "./insights/actionabilityEngine.js";
// ─── Column name helpers ──────────────────────────────────────────────────────
function findCol(row, candidates) {
    const keys = Object.keys(row);
    for (const candidate of candidates) {
        const exact = keys.find(k => k === candidate);
        if (exact)
            return exact;
    }
    for (const candidate of candidates) {
        const loose = keys.find(k => k.toLowerCase().includes(candidate.toLowerCase()));
        if (loose)
            return loose;
    }
    return undefined;
}
function toNum(v) {
    const n = Number(v);
    return isFinite(n) ? n : 0;
}
function toStr(v) {
    return v == null ? "" : String(v).trim();
}
// ─── Contributor row parsing ──────────────────────────────────────────────────
const COLS = {
    dimensionValue: ["dimension_value"],
    metricValue: ["metric_value"],
    volume: ["Volume", "volume"],
    volumeSharePct: ["Volume Share %", "volume_share_pct", "Current Volume Share %"],
    metricDelta: ["Metric Delta", "metric_delta", "Metric Change", "metric_change"],
    weightedContribution: ["Weighted Contribution", "weighted_contribution"],
    contributionPct: ["Contribution %", "contribution_pct", "Contribution to Change %"],
    overallMetricChange: ["Overall Metric Change", "overall_metric_change"],
    period: ["period"],
    entity: ["entity"]
};
function parseContributorRow(row, metricName) {
    const keys = Object.keys(row);
    // Bug 1 Fix: Entity Attribution. 
    // Isolate the dimension name column by ignoring all known stat/metric columns.
    const knownStats = [
        ...COLS.metricValue, ...COLS.volume, ...COLS.volumeSharePct,
        ...COLS.metricDelta, ...COLS.weightedContribution, ...COLS.contributionPct,
        ...COLS.overallMetricChange, ...COLS.period, ...COLS.entity,
        metricName.toLowerCase()
    ];
    let nameKey = findCol(row, COLS.dimensionValue);
    if (!nameKey) {
        nameKey = keys.find(k => !knownStats.some(s => k.toLowerCase().includes(s.toLowerCase())) &&
            typeof row[k] === "string");
    }
    if (!nameKey)
        nameKey = keys[0];
    if (!nameKey)
        return null;
    const name = toStr(row[nameKey]);
    if (!name)
        return null;
    const metricValueKey = findCol(row, COLS.metricValue) ?? findCol(row, [metricName]);
    const volumeKey = findCol(row, COLS.volume);
    const volumeShareKey = findCol(row, COLS.volumeSharePct);
    const metricDeltaKey = findCol(row, COLS.metricDelta);
    const weightedContrib = findCol(row, COLS.weightedContribution);
    const contributionKey = findCol(row, COLS.contributionPct);
    return {
        name,
        metricValue: metricValueKey ? toNum(row[metricValueKey]) : 0,
        volume: volumeKey ? toNum(row[volumeKey]) : 0,
        volumeSharePct: volumeShareKey ? toNum(row[volumeShareKey]) : 0,
        metricDelta: metricDeltaKey ? toNum(row[metricDeltaKey]) : 0,
        weightedContribution: weightedContrib ? toNum(row[weightedContrib]) : 0,
        contributionPct: contributionKey ? toNum(row[contributionKey]) : 0
    };
}
// ─── Period change detection ──────────────────────────────────────────────────
function extractMetricChange(rows, metricName) {
    if (rows.length === 0)
        return null;
    const first = rows[0];
    // With the new SQL we explicitly provide "Overall Metric Change"
    const overallChangeKey = findCol(first, COLS.overallMetricChange);
    if (overallChangeKey) {
        // We no longer have explicit "Current" vs "Prior" columns because the SQL engine 
        // doesn't output the full Cartesian product. The orchestrator / trend handles that.
        // Wait, the orchestrator just extracts "Metric Delta" per row.
        // But what about the OVERALL current/prior values? 
        // If we don't have them, we can't fully populate MetricChange, but we CAN populate direction and absoluteChange.
        const absoluteChange = toNum(first[overallChangeKey]);
        // Let's just mock the current/prior period labels if they aren't provided by the column headers.
        return {
            currentPeriod: "Current",
            priorPeriod: "Prior",
            currentValue: 0, // We don't have this readily available without a dedicated query
            priorValue: 0,
            absoluteChange: +absoluteChange.toFixed(4),
            relativeChangePct: 0,
            direction: absoluteChange > 0.001 ? "increase"
                : absoluteChange < -0.001 ? "decline"
                    : "flat"
        };
    }
    const entityKey = findCol(first, COLS.entity);
    if (entityKey && rows.length === 2) {
        const metricKey = Object.keys(first).find(k => k !== entityKey && typeof first[k] === "number");
        if (metricKey) {
            const [rowA, rowB] = rows;
            const aVal = toNum(rowA[metricKey]);
            const bVal = toNum(rowB[metricKey]);
            const absChange = aVal - bVal;
            return {
                currentPeriod: toStr(rowA[entityKey]),
                priorPeriod: toStr(rowB[entityKey]),
                currentValue: +aVal.toFixed(4),
                priorValue: +bVal.toFixed(4),
                absoluteChange: +absChange.toFixed(4),
                relativeChangePct: bVal !== 0
                    ? +((absChange / Math.abs(bVal)) * 100).toFixed(2)
                    : 0,
                direction: absChange > 0.001 ? "increase"
                    : absChange < -0.001 ? "decline"
                        : "flat"
            };
        }
    }
    return null;
}
// ─── Contradiction detection ──────────────────────────────────────────────────
function detectContradiction(question, direction) {
    if (!direction || direction === "flat")
        return { contradictionDetected: false };
    const q = question.toLowerCase();
    const isDeclineExpected = q.match(/\b(lose|decline|drop|decrease|down|worse)\b/);
    const isIncreaseExpected = q.match(/\b(increase|improve|grow|up|better|gain)\b/);
    if (isDeclineExpected && direction === "increase") {
        return { contradictionDetected: true, expectedDirection: "decline" };
    }
    if (isIncreaseExpected && direction === "decline") {
        return { contradictionDetected: true, expectedDirection: "increase" };
    }
    return { contradictionDetected: false };
}
// ─── Dimension classification ─────────────────────────────────────────────────
const DIM_COLUMN_MAP = {
    "Hotel": "hotel",
    "hotel": "hotel",
    "Chain": "chain",
    "chain": "chain",
    "Supplier": "supplier",
    "supplier": "supplier",
    "Destination": "destination",
    "destination": "destination",
    "APW Bucket": "apw",
    "apw": "apw"
};
function detectDimensionCategory(rows, semanticLayer) {
    if (rows.length === 0)
        return "unknown";
    const keys = Object.keys(rows[0]);
    for (const key of keys) {
        for (const [pattern, category] of Object.entries(DIM_COLUMN_MAP)) {
            if (key.toLowerCase().includes(pattern.toLowerCase())) {
                return category;
            }
        }
    }
    for (const dim of semanticLayer.dimensions) {
        const found = keys.some(k => k.toLowerCase().includes(dim.toLowerCase()));
        if (found) {
            if (dim === "hotel")
                return "hotel";
            if (dim === "chain")
                return "chain";
            if (dim === "supplier")
                return "supplier";
            if (dim === "destination")
                return "destination";
            if (dim === "apw")
                return "apw";
        }
    }
    return "unknown";
}
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * RootCausePackBuilder
 *
 * Transforms raw DuckDB query results from MULTIPLE dimension analyses into a
 * single structured, LLM-ready fact payload for executive analytics narratives.
 */
export function buildRootCausePack(question, semanticLayer, queryResultsList, competitorContext) {
    const metricName = semanticLayer.metrics[0]?.name ?? "Metric";
    const affectedHotels = [];
    const affectedChains = [];
    const affectedSuppliers = [];
    const affectedAPWBuckets = [];
    let metricChange = null;
    let totalRows = 0;
    const allValidEntries = [];
    // Process each result set (each represents one dimension's contribution analysis)
    for (const queryResults of queryResultsList) {
        if (queryResults.length === 0)
            continue;
        totalRows += queryResults.length;
        // Parse rows
        const entries = queryResults
            .map(row => parseContributorRow(row, metricName))
            .filter((e) => e !== null && e.name !== "" && isFinite(e.contributionPct));
        allValidEntries.push(...entries);
        // Classify and bucket
        const dimCategory = detectDimensionCategory(queryResults, semanticLayer);
        if (dimCategory === "hotel")
            affectedHotels.push(...entries);
        else if (dimCategory === "chain")
            affectedChains.push(...entries);
        else if (dimCategory === "supplier")
            affectedSuppliers.push(...entries);
        else if (dimCategory === "apw")
            affectedAPWBuckets.push(...entries);
        // Extract metric change from the first set that has it
        if (!metricChange) {
            metricChange = extractMetricChange(queryResults, metricName);
        }
    }
    // Contradiction detection
    const contradictionInfo = detectContradiction(question, metricChange?.direction);
    // Global Top Positive / Negative across ALL dimensions
    // For normalization, we sort by absolute `weightedContribution` or `contributionPct`
    const positives = allValidEntries
        .filter(e => e.weightedContribution > 0)
        .sort((a, b) => b.weightedContribution - a.weightedContribution)
        .slice(0, 10);
    const negatives = allValidEntries
        .filter(e => e.weightedContribution < 0)
        .sort((a, b) => a.weightedContribution - b.weightedContribution)
        .slice(0, 10);
    const priorityDrivers = prioritizeInsights(positives, negatives);
    const risks = detectRisks(priorityDrivers, metricChange);
    const opportunities = detectOpportunities(priorityDrivers);
    const pack = {
        metricName,
        metricChange,
        contradictionDetected: contradictionInfo.contradictionDetected,
        expectedDirection: contradictionInfo.expectedDirection,
        topPositiveContributors: positives,
        topNegativeContributors: negatives,
        priorityDrivers,
        risks,
        opportunities,
        actionabilityTargets: [],
        affectedHotels,
        affectedChains,
        affectedSuppliers,
        affectedAPWBuckets,
        trendSummary: [], // Trend usually disabled during multi-dimension RCA to save time
        totalRows,
        builtAt: new Date().toISOString(),
        competitorContext
    };
    if (competitorContext) {
        // Collect sample rows from the first queryResult that has data
        let sampleRows = [];
        for (const res of queryResultsList) {
            if (res.length > 0) {
                sampleRows = res.slice(0, 2);
                break;
            }
        }
        console.log(`[RCA_CONTEXT]\n` +
            `competitor=${competitorContext.competitorName}\n` +
            `rowCount=${totalRows}\n` +
            `sampleRows=${JSON.stringify(sampleRows, null, 2)}\n` +
            `filters=[\n  thirdparty=${competitorContext.competitorName}\n]`);
    }
    // Calculate actionability
    const allContributorsWithType = [
        ...affectedHotels.map(e => ({ entry: e, type: "HOTEL" })),
        ...affectedChains.map(e => ({ entry: e, type: "CHAIN" })),
        ...affectedSuppliers.map(e => ({ entry: e, type: "SUPPLIER" })),
        ...affectedAPWBuckets.map(e => ({ entry: e, type: "APW" }))
    ];
    let intent = DecisionIntent.EXPLAIN;
    const qLower = question.toLowerCase();
    if (qLower.includes("win against") || qLower.includes("beat") || qLower.includes("outperform") || qLower.includes("competitor")) {
        intent = DecisionIntent.COMPETE;
    }
    else if (qLower.includes("fix") || qLower.includes("worst") || qLower.includes("lowest") ||
        qLower.includes("bottom") || qLower.includes("hurting") || qLower.includes("drag") ||
        qLower.includes("underperforming") || qLower.includes("declining") || qLower.includes("problem") ||
        qLower.includes("risk") || qLower.includes("weakness")) {
        intent = DecisionIntent.FIX;
    }
    else if (qLower.includes("improve")) {
        intent = DecisionIntent.IMPROVE;
    }
    else if (qLower.includes("focus on") || qLower.includes("prioritize") ||
        qLower.includes("highest roi") || qLower.includes("fastest win") ||
        qLower.includes("allocate resources") || qLower.includes("only fix one")) {
        intent = DecisionIntent.PRIORITIZE;
    }
    else if (qLower.includes("expand") || qLower.includes("scale") || qLower.includes("best") || qLower.includes("highest")) {
        intent = DecisionIntent.EXPAND;
    }
    else if (qLower.includes("protect") || qLower.includes("defend") || qLower.includes("risk")) {
        intent = DecisionIntent.PROTECT;
    }
    pack.actionabilityTargets = calculateActionabilityTargets(allContributorsWithType, intent, competitorContext);
    pack.primaryTarget = pack.actionabilityTargets.length > 0 ? pack.actionabilityTargets[0] : undefined;
    // Validate the pack to catch any lingering attribution bugs
    pack.validationErrors = validateRootCausePack(pack);
    console.log(`[RootCausePack] Built for: "${question.slice(0, 60)}" | ` +
        `resultSets=${queryResultsList.length} | rows=${totalRows} | ` +
        `positive=${positives.length} | negative=${negatives.length} | ` +
        `contradiction=${pack.contradictionDetected} | ` +
        `valid=${pack.validationErrors.length === 0}`);
    return pack;
}
