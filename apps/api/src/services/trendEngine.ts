import { QuestionAnalysis } from "../ai/questionTypes.js";
import { EnrichedSemanticLayer } from "../ai/semanticLayer.js";
import { buildWhereClause } from "../ai/filterBuilder.js";
import { resolveOrDiscardEntities } from "../ai/entityResolver.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TimeGranularity = "MONTH" | "QUARTER" | "YEAR";

export interface TrendResult {
    sql: string;
    explanation: string;
}

// ─── Granularity Detection ────────────────────────────────────────────────────

/**
 * Signals that indicate a specific time granularity.
 * Ordered by specificity — more specific patterns checked first.
 */
const GRANULARITY_SIGNALS: Record<TimeGranularity, string[]> = {
    QUARTER: [
        "quarterly", "quarter", "quarter over quarter", "qoq", "q1", "q2", "q3", "q4"
    ],
    YEAR: [
        "yearly", "annual", "annually", "year over year", "yoy", "per year", "by year"
    ],
    MONTH: [
        "monthly", "month", "month over month", "mom", "per month", "by month",
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december"
    ]
};

/**
 * Detects the intended time granularity from the question text.
 * Defaults to MONTH if no specific signal is found — the most common trend use-case.
 */
function detectGranularity(question: string): TimeGranularity {
    const lower = question.toLowerCase();

    // QUARTER and YEAR checked before MONTH to avoid false positives
    for (const granularity of ["QUARTER", "YEAR", "MONTH"] as TimeGranularity[]) {
        const signals = GRANULARITY_SIGNALS[granularity];
        if (signals.some(s => lower.includes(s))) {
            return granularity;
        }
    }

    return "MONTH";
}

// ─── Grouping Dimension Detection ─────────────────────────────────────────────

/**
 * Maps canonical dimension keys to human-readable labels for explanations.
 */
const DIMENSION_LABELS: Record<string, string> = {
    destination: "destination",
    supplier:    "supplier",
    hotel:       "hotel",
    chain:       "chain",
    country:     "country",
    city:        "city",
    apw:         "APW bucket"
};

/**
 * Resolves the physical column name for a canonical dimension key
 * using the semantic layer's reversed columnMappings.
 */
function resolvePhysicalColumn(
    canonicalKey: string,
    semanticLayer: EnrichedSemanticLayer
): string {
    // columnMappings is { physicalCol → canonicalKey }; reverse lookup
    const entry = Object.entries(semanticLayer.columnMappings)
        .find(([, canonical]) => canonical === canonicalKey);
    if (entry) return entry[0];

    // Fallback: direct name match on schema
    const direct = semanticLayer.allColumns
        .find(c => c.column_name.toLowerCase() === canonicalKey.toLowerCase());
    return direct ? direct.column_name : canonicalKey;
}

// ─── Date Truncation Expression ───────────────────────────────────────────────

/**
 * Builds the DATE_TRUNC expression for a VARCHAR date column stored as MM/DD/YYYY.
 * DuckDB's STRPTIME converts the string to a proper timestamp first.
 */
function buildPeriodExpression(
    dateCol: string,
    granularity: TimeGranularity
): string {
    const granLabel = granularity.toLowerCase() as "month" | "quarter" | "year";
    return `DATE_TRUNC('${granLabel}', STRPTIME("${dateCol}", '%m/%d/%Y'))`;
}

// ─── Metric Resolution ────────────────────────────────────────────────────────

/**
 * Resolves the metric to plot — from analysis or falls back to primary metric.
 */
function resolveMetric(
    analysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer
): { formula: string; name: string } | null {
    let metricKeys = analysis.metrics;

    if (metricKeys.length === 0) {
        const primary = semanticLayer.metricKeys[0];
        if (!primary) return null;
        metricKeys = [primary];
        console.log(`[TrendEngine] Inferred primary metric: ${primary}`);
    }

    if (metricKeys.length !== 1) return null;

    const metricKey = metricKeys[0];
    const metric = semanticLayer.metrics.find(m =>
        m.name.toLowerCase().replace(/\s+/g, "_") === metricKey ||
        m.name.toLowerCase().includes(metricKey.replace(/_/g, " "))
    );

    if (!metric) {
        console.warn(`[TrendEngine] Metric '${metricKey}' not found in semantic layer.`);
        return null;
    }

    return { formula: metric.formula, name: metric.name };
}

// ─── WHERE Clause Assembly ────────────────────────────────────────────────────

/**
 * Builds the WHERE clause from all filters, excluding time dimension filters
 * (month/year/quarter) since those are already encoded in the period grouping.
 *
 * Entity filters (_entity) are matched ILIKE against all VARCHAR columns.
 */
function buildTrendWhereClause(
    analysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer
): string {
    const schemaColumns = semanticLayer.allColumns.map(c => c.column_name);

    // Exclude time filters (handled by DATE_TRUNC) and split entity vs typed
    const TIME_DIMENSIONS = new Set(["month", "year", "quarter", "time"]);
    const typedFilters = analysis.filters.filter(
        f => !TIME_DIMENSIONS.has(f.dimension) && f.dimension !== "_entity"
    );
    const entityFilters = analysis.filters.filter(f => f.dimension === "_entity");

    const typedWhere = buildWhereClause(typedFilters, schemaColumns);

    // Entity filters → ILIKE across all VARCHAR columns
    let entityConditions = "";
    if (entityFilters.length > 0) {
        const stringCols = semanticLayer.allColumns.filter(c =>
            c.column_type.toUpperCase().includes("VARCHAR") ||
            c.column_type.toUpperCase().includes("STRING") ||
            c.column_type.toUpperCase().includes("TEXT")
        );
        if (stringCols.length > 0) {
            const parts = entityFilters.map(f => {
                const safe = String(f.value).replace(/'/g, "''");
                const checks = stringCols
                    .map(c => `"${c.column_name}" ILIKE '%${safe}%'`)
                    .join(" OR ");
                return `(${checks})`;
            });
            entityConditions = parts.join(" AND ");
        }
    }

    if (typedWhere && entityConditions) {
        return `${typedWhere} AND ${entityConditions}`;
    } else if (typedWhere) {
        return typedWhere;
    } else if (entityConditions) {
        return `WHERE ${entityConditions}`;
    }

    return "";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Trend Engine
 *
 * Generates deterministic time-series SQL for TREND intent questions.
 * No LLM involved — fully rule-based from QuestionAnalysis + SemanticLayer.
 *
 * Supported patterns:
 *  - "win rate trend"              → metric over time
 *  - "monthly win rate"            → metric bucketed by month
 *  - "supplier trend"              → primary metric grouped by supplier over time
 *  - "hotel / chain / destination" → same pattern for other dimensions
 *  - "month over month trend"      → MONTH granularity
 *  - "quarterly trend"             → QUARTER granularity
 *  - "yearly trend"                → YEAR granularity
 *  - "win rate trend in London"    → metric over time with entity filter applied
 *
 * Returns null if required data (metric, time column) cannot be resolved.
 */
export function generateTrendSql(
    analysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer
): TrendResult | null {
    // Resolve/discard placeholder entity filters
    analysis.filters = resolveOrDiscardEntities(
        analysis.filters,
        analysis.focus,
        semanticLayer.dimensions
    );

    // ── 1. Resolve metric ──────────────────────────────────────────────────────
    const metric = resolveMetric(analysis, semanticLayer);
    if (!metric) {
        console.warn("[TrendEngine] Cannot resolve metric — returning null.");
        return null;
    }

    // ── 2. Resolve time column ─────────────────────────────────────────────────
    const timeCol = semanticLayer.primaryTimeDimension
        || semanticLayer.availableTimeColumns?.[0];
    if (!timeCol) {
        console.warn("[TrendEngine] No time column found in semantic layer — returning null.");
        return null;
    }

    // ── 3. Detect granularity ──────────────────────────────────────────────────
    const granularity = detectGranularity(analysis.originalQuestion);
    const periodExpr = buildPeriodExpression(timeCol, granularity);

    console.log(
        `[TrendEngine] Metric: ${metric.name} | Granularity: ${granularity} | ` +
        `TimeCol: ${timeCol} | Dims: [${analysis.dimensions.join(",")}]`
    );

    // ── 4. Resolve optional grouping dimension ─────────────────────────────────
    // A trend may group by one dimension (e.g. "supplier trend") — take the first
    // if present; purely temporal trends have no extra grouping.
    const groupDimKey = analysis.dimensions[0] ?? null;
    let groupCol: string | null = null;
    let groupSelectExpr = "";
    let groupByExtra = "";

    if (groupDimKey) {
        groupCol = resolvePhysicalColumn(groupDimKey, semanticLayer);
        groupSelectExpr = `"${groupCol}", `;
        groupByExtra = `, "${groupCol}"`;
        console.log(`[TrendEngine] Group dimension: ${groupDimKey} → "${groupCol}"`);
    }

    // ── 5. Build WHERE clause ──────────────────────────────────────────────────
    const whereClause = buildTrendWhereClause(analysis, semanticLayer);

    if (whereClause) {
        console.log(`[TrendEngine] WHERE: ${whereClause}`);
    }

    // ── 6. Assemble SQL ────────────────────────────────────────────────────────
    const sql = [
        `SELECT`,
        `    ${periodExpr} AS period,`,
        groupSelectExpr ? `    ${groupSelectExpr.slice(0, -2)},` : null,
        `    ${metric.formula} AS "${metric.name}"`,
        `FROM data_table`,
        whereClause || null,
        `GROUP BY period${groupByExtra}`,
        `ORDER BY period${groupByExtra}`
    ]
        .filter(line => line !== null)
        .join("\n");

    // ── 7. Build explanation ───────────────────────────────────────────────────
    const granLabel = granularity.charAt(0) + granularity.slice(1).toLowerCase();
    const dimLabel = groupDimKey ? ` by ${DIMENSION_LABELS[groupDimKey] ?? groupDimKey}` : "";
    const filterCount = analysis.filters.filter(
        f => !["month", "year", "quarter", "time"].includes(f.dimension)
    ).length;
    const filterNote = filterCount > 0
        ? ` with ${filterCount} filter${filterCount > 1 ? "s" : ""} applied`
        : "";

    const explanation =
        `${granLabel} trend of ${metric.name}${dimLabel}${filterNote}, ` +
        `grouped by ${granLabel.toLowerCase()} using ${timeCol}.`;

    console.log(`[TrendEngine] Generated trend SQL (${sql.split("\n").length} lines).`);

    return { sql, explanation };
}
