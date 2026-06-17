import { EnrichedSemanticLayer } from "../ai/semanticLayer.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single contributing entity with its metric and contribution stats. */
export interface ContributorEntry {
    /** The dimension member name (e.g. "Marriott", "London", "Booking.com") */
    name: string;

    /** This member's metric value (e.g. win rate %) */
    metricValue: number;

    /** Overall metric across all data (the baseline) */
    overallMetric: number;

    /** metricValue − overallMetric (positive = above average, negative = below) */
    vsAverage: number;

    /** Volume share of this member as a percentage of total records */
    volumeSharePct: number;

    /** Weighted contribution to the overall metric (signed %) */
    contributionPct: number;
}

/** Metric change between two periods (populated only when two periods exist). */
export interface MetricChange {
    /** Higher period label (e.g. "Q2", "Month 4", "2025") */
    currentPeriod: string;

    /** Lower period label (e.g. "Q1", "Month 1", "2024") */
    priorPeriod: string;

    /** Current period metric value */
    currentValue: number;

    /** Prior period metric value */
    priorValue: number;

    /** Absolute change (currentValue − priorValue) */
    absoluteChange: number;

    /** Relative change as a percentage */
    relativeChangePct: number;

    /** Direction: "increase" | "decline" | "flat" */
    direction: "increase" | "decline" | "flat";
}

/** Trend data point for the trendSummary field. */
export interface TrendPoint {
    period: string;
    value: number;
}

/** The full root cause intelligence pack. */
export interface RootCausePack {
    /** Name of the metric being analysed (e.g. "Win Rate") */
    metricName: string;

    /**
     * Period-over-period change stats.
     * null when no two-period comparison was detected in the results.
     */
    metricChange: MetricChange | null;

    /**
     * Top members pulling the metric ABOVE average (positive contribution).
     * Sorted by contributionPct DESC.
     */
    topPositiveContributors: ContributorEntry[];

    /**
     * Top members pulling the metric BELOW average (negative contribution).
     * Sorted by contributionPct ASC (largest negative first).
     */
    topNegativeContributors: ContributorEntry[];

    /** Hotel-level entries present in the result set. */
    affectedHotels: ContributorEntry[];

    /** Chain-level entries present in the result set. */
    affectedChains: ContributorEntry[];

    /** Supplier-level entries present in the result set. */
    affectedSuppliers: ContributorEntry[];

    /** APW bucket entries present in the result set. */
    affectedAPWBuckets: ContributorEntry[];

    /**
     * Chronological time-series points for trend context.
     * Empty when the result set is not a trend (has no period column).
     */
    trendSummary: TrendPoint[];

    /** Total number of rows in the raw result set. */
    totalRows: number;

    /** ISO timestamp of when this pack was built. */
    builtAt: string;
}

// ─── Column name helpers ──────────────────────────────────────────────────────

/**
 * Finds a column by checking for an exact match, then a case-insensitive
 * substring match. Returns the matched key or undefined.
 */
function findCol(
    row: Record<string, unknown>,
    candidates: readonly string[]
): string | undefined {
    const keys = Object.keys(row);
    for (const candidate of candidates) {
        const exact = keys.find(k => k === candidate);
        if (exact) return exact;
    }
    for (const candidate of candidates) {
        const loose = keys.find(k => k.toLowerCase().includes(candidate.toLowerCase()));
        if (loose) return loose;
    }
    return undefined;
}

function toNum(v: unknown): number {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
}

function toStr(v: unknown): string {
    return v == null ? "" : String(v).trim();
}

// ─── Contributor row parsing ──────────────────────────────────────────────────

/**
 * Known column name patterns produced by contributionEngine.ts.
 * We detect them by substring match so renamed columns still resolve.
 */
const COLS = {
    dimensionValue:   ["dimension_value"],
    metricValue:      ["metric_value"],
    overallMetric:    ["overall_metric", "Overall"],
    vsAverage:        ["vs Average", "vs_average"],
    volumeSharePct:   ["Volume Share %", "volume_share_pct", "Current Volume Share %"],
    contributionPct:  ["Contribution %", "contribution_pct", "Contribution to Change %"],
    metricChange:     ["Metric Change", "metric_change"],
    currentMetric:    ["current)"],       // matches e.g. "Win Rate (Q2)"
    priorMetric:      ["prior)"],         // matches e.g. "Win Rate (Q1)"
    period:           ["period"],
    entity:           ["entity"]          // comparison engine output
} as const;

/**
 * Parses a single raw row into a ContributorEntry.
 * Returns null if the row lacks the minimum required columns.
 */
function parseContributorRow(
    row: Record<string, unknown>,
    metricName: string
): ContributorEntry | null {
    // Dimension value — try "dimension_value" then fall back to the metric-named col
    const nameKey = findCol(row, COLS.dimensionValue)
        ?? findCol(row, [metricName])
        ?? Object.keys(row)[0];

    if (!nameKey) return null;

    const name = toStr(row[nameKey]);
    if (!name) return null;

    const metricValueKey  = findCol(row, COLS.metricValue)  ?? findCol(row, [metricName]);
    const overallKey      = findCol(row, COLS.overallMetric);
    const vsAvgKey        = findCol(row, COLS.vsAverage);
    const volumeShareKey  = findCol(row, COLS.volumeSharePct);
    const contributionKey = findCol(row, COLS.contributionPct);

    return {
        name,
        metricValue:    metricValueKey    ? toNum(row[metricValueKey])  : 0,
        overallMetric:  overallKey        ? toNum(row[overallKey])      : 0,
        vsAverage:      vsAvgKey          ? toNum(row[vsAvgKey])        : 0,
        volumeSharePct: volumeShareKey    ? toNum(row[volumeShareKey])  : 0,
        contributionPct: contributionKey  ? toNum(row[contributionKey]) : 0
    };
}

// ─── Period change detection ──────────────────────────────────────────────────

/**
 * Attempts to extract MetricChange from a comparison-engine or
 * two-period contribution-engine result set.
 *
 * Comparison engine output: rows have "entity" + metric column.
 * Two-period contribution: rows have "Metric Change" column.
 */
function extractMetricChange(
    rows: Record<string, unknown>[],
    metricName: string
): MetricChange | null {
    if (rows.length === 0) return null;

    const first = rows[0];

    // ── Two-period contribution output ────────────────────────────────────────
    const metricChangeKey = findCol(first, COLS.metricChange);
    if (metricChangeKey) {
        // Find column keys that match current/prior period patterns
        const keys = Object.keys(first);
        const currentKey = keys.find(k => k.match(/\((?:Q\d|\d{4}|Month \d+)\)$/) && !k.toLowerCase().includes("prior"));
        const priorKey   = keys.find(k => k.match(/\((?:Q\d|\d{4}|Month \d+)\)$/) && k !== currentKey);

        if (currentKey && priorKey && rows.length > 0) {
            const currentValues = rows.map(r => toNum(r[currentKey]));
            const priorValues   = rows.map(r => toNum(r[priorKey]));
            const currentAvg    = currentValues.reduce((a, b) => a + b, 0) / currentValues.length;
            const priorAvg      = priorValues.reduce((a, b) => a + b, 0) / priorValues.length;
            const absChange     = currentAvg - priorAvg;

            // Extract period labels from column names e.g. "Win Rate (Q2)" → "Q2"
            const currentLabel = (currentKey.match(/\((.+)\)$/) ?? [])[1] ?? "Current";
            const priorLabel   = (priorKey.match(/\((.+)\)$/) ?? [])[1] ?? "Prior";

            return {
                currentPeriod:     currentLabel,
                priorPeriod:       priorLabel,
                currentValue:      +currentAvg.toFixed(4),
                priorValue:        +priorAvg.toFixed(4),
                absoluteChange:    +absChange.toFixed(4),
                relativeChangePct: priorAvg !== 0
                    ? +((absChange / Math.abs(priorAvg)) * 100).toFixed(2)
                    : 0,
                direction: absChange > 0.001 ? "increase"
                         : absChange < -0.001 ? "decline"
                         : "flat"
            };
        }
    }

    // ── Comparison engine output (entity column) ───────────────────────────────
    const entityKey = findCol(first, COLS.entity);
    if (entityKey && rows.length === 2) {
        const metricKey = Object.keys(first).find(k =>
            k !== entityKey && typeof first[k] === "number"
        );
        if (metricKey) {
            const [rowA, rowB] = rows;
            const aVal = toNum(rowA[metricKey]);
            const bVal = toNum(rowB[metricKey]);
            const absChange = aVal - bVal;
            return {
                currentPeriod:     toStr(rowA[entityKey]),
                priorPeriod:       toStr(rowB[entityKey]),
                currentValue:      +aVal.toFixed(4),
                priorValue:        +bVal.toFixed(4),
                absoluteChange:    +absChange.toFixed(4),
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

// ─── Trend summary extraction ─────────────────────────────────────────────────

/**
 * Extracts chronological trend points when the result set contains a "period" column.
 * Values are coerced to a sortable string and numeric metric.
 */
function extractTrendSummary(
    rows: Record<string, unknown>[],
    metricName: string
): TrendPoint[] {
    if (rows.length === 0) return [];

    const first = rows[0];
    const periodKey = findCol(first, COLS.period);
    if (!periodKey) return [];

    const metricKey = findCol(first, [metricName])
        ?? Object.keys(first).find(k => k !== periodKey && typeof first[k] === "number");

    if (!metricKey) return [];

    return rows
        .map(r => ({
            period: toStr(r[periodKey]),
            value:  +toNum(r[metricKey]).toFixed(4)
        }))
        .filter(p => p.period !== "")
        .sort((a, b) => a.period.localeCompare(b.period));
}

// ─── Dimension classification ─────────────────────────────────────────────────

/**
 * Known dimension key columns and the canonical category they belong to.
 * Used to route ContributorEntry rows into affectedHotels / affectedChains etc.
 */
const DIM_COLUMN_MAP: Record<string, "hotel" | "chain" | "supplier" | "destination" | "apw"> = {
    "Hotel":       "hotel",
    "hotel":       "hotel",
    "Chain":       "chain",
    "chain":       "chain",
    "Supplier":    "supplier",
    "supplier":    "supplier",
    "Destination": "destination",
    "destination": "destination",
    "APW Bucket":  "apw",
    "apw":         "apw"
};

/**
 * Detects which dimension category a result set belongs to by examining
 * the dimension label (column header) in the first row.
 */
function detectDimensionCategory(
    rows: Record<string, unknown>[],
    semanticLayer: EnrichedSemanticLayer
): "hotel" | "chain" | "supplier" | "destination" | "apw" | "unknown" {
    if (rows.length === 0) return "unknown";

    const keys = Object.keys(rows[0]);

    for (const key of keys) {
        for (const [pattern, category] of Object.entries(DIM_COLUMN_MAP)) {
            if (key.toLowerCase().includes(pattern.toLowerCase())) {
                return category;
            }
        }
    }

    // Fallback: check semantic layer dimension keys against the column names
    for (const dim of semanticLayer.dimensions) {
        const found = keys.some(k => k.toLowerCase().includes(dim.toLowerCase()));
        if (found) {
            if (dim === "hotel")       return "hotel";
            if (dim === "chain")       return "chain";
            if (dim === "supplier")    return "supplier";
            if (dim === "destination") return "destination";
            if (dim === "apw")         return "apw";
        }
    }

    return "unknown";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * RootCausePackBuilder
 *
 * Transforms raw DuckDB query results into a structured, LLM-ready fact payload
 * for executive analytics narratives.
 *
 * This module contains ZERO business logic — it only:
 *  1. Parses raw rows into typed structures
 *  2. Classifies rows into dimension buckets (hotel, chain, etc.)
 *  3. Splits contributors into positive/negative by contributionPct
 *  4. Detects period changes when available
 *  5. Extracts trend points when available
 *
 * Designed to work with output from:
 *  - contributionEngine.ts  (single-period and two-period)
 *  - comparisonEngine.ts    (two-entity UNION ALL)
 *  - trendEngine.ts         (time-series)
 *  - sqlTemplateEngine.ts   (any BREAKDOWN/RANKING)
 */
export function buildRootCausePack(
    question: string,
    semanticLayer: EnrichedSemanticLayer,
    queryResults: Record<string, unknown>[]
): RootCausePack {

    const metricName = semanticLayer.metrics[0]?.name ?? "Metric";

    // ── Parse all rows into ContributorEntry objects ───────────────────────────
    const allEntries: ContributorEntry[] = queryResults
        .map(row => parseContributorRow(row, metricName))
        .filter((e): e is ContributorEntry => e !== null && e.name !== "");

    // ── Split positive / negative contributors ─────────────────────────────────
    const positives = allEntries
        .filter(e => e.contributionPct > 0)
        .sort((a, b) => b.contributionPct - a.contributionPct)
        .slice(0, 10);

    const negatives = allEntries
        .filter(e => e.contributionPct < 0)
        .sort((a, b) => a.contributionPct - b.contributionPct)
        .slice(0, 10);

    // ── Classify rows into dimension buckets ───────────────────────────────────
    const dimCategory = detectDimensionCategory(queryResults, semanticLayer);

    const affectedHotels:      ContributorEntry[] = [];
    const affectedChains:      ContributorEntry[] = [];
    const affectedSuppliers:   ContributorEntry[] = [];
    const affectedAPWBuckets:  ContributorEntry[] = [];

    if (dimCategory === "hotel")       affectedHotels.push(...allEntries);
    else if (dimCategory === "chain")  affectedChains.push(...allEntries);
    else if (dimCategory === "supplier") affectedSuppliers.push(...allEntries);
    else if (dimCategory === "apw")    affectedAPWBuckets.push(...allEntries);
    // For destination / unknown: rows go only into contributors, not dimension buckets

    // ── Extract period-over-period change ──────────────────────────────────────
    const metricChange = extractMetricChange(queryResults, metricName);

    // ── Extract trend summary ──────────────────────────────────────────────────
    const trendSummary = extractTrendSummary(queryResults, metricName);

    // ── Log ────────────────────────────────────────────────────────────────────
    console.log(
        `[RootCausePack] Built for: "${question.slice(0, 60)}" | ` +
        `rows=${queryResults.length} | dim=${dimCategory} | ` +
        `positive=${positives.length} | negative=${negatives.length} | ` +
        `trend=${trendSummary.length} | change=${metricChange ? "yes" : "no"}`
    );

    return {
        metricName,
        metricChange,
        topPositiveContributors: positives,
        topNegativeContributors: negatives,
        affectedHotels,
        affectedChains,
        affectedSuppliers,
        affectedAPWBuckets,
        trendSummary,
        totalRows: queryResults.length,
        builtAt: new Date().toISOString()
    };
}
