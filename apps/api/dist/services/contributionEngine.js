import { resolvePhysicalColumn } from "../ai/dimensionRegistry.js";
import { buildWhereClause } from "../ai/filterBuilder.js";
// ─── Constants ────────────────────────────────────────────────────────────────
const DATE_FORMAT = `'%m/%d/%Y'`;
/** Dimension priority order for auto-selection when none is specified. */
const CONTRIBUTION_DIM_PRIORITY = [
    "hotel",
    "chain",
    "supplier",
    "destination",
    "apw",
    "country",
    "city"
];
const TIME_DIMENSIONS = new Set(["month", "year", "quarter", "time"]);
// ─── Metric resolution ────────────────────────────────────────────────────────
function resolveMetric(analysis, semanticLayer) {
    let metricKeys = analysis.metrics;
    if (metricKeys.length === 0) {
        const primary = semanticLayer.metricKeys[0];
        if (!primary)
            return null;
        metricKeys = [primary];
        console.log(`[ContributionEngine] Inferred primary metric: ${primary}`);
    }
    if (metricKeys.length !== 1)
        return null;
    const metricKey = metricKeys[0];
    const metric = semanticLayer.metrics.find(m => m.name.toLowerCase().replace(/\s+/g, "_") === metricKey ||
        m.name.toLowerCase().includes(metricKey.replace(/_/g, " ")));
    if (!metric) {
        console.warn(`[ContributionEngine] Metric '${metricKey}' not found in semantic layer.`);
        return null;
    }
    return { formula: metric.formula, name: metric.name };
}
// ─── Dimension resolution ─────────────────────────────────────────────────────
/**
 * Resolves the grouping dimension to use for contribution analysis.
 *
 * Priority:
 *  1. Explicit dimension from the question (e.g. "hotel contribution")
 *  2. First dimension from CONTRIBUTION_DIM_PRIORITY found in the schema
 */
function resolveContributionDimension(analysis, semanticLayer, forceDimension) {
    const schemaColumns = semanticLayer.allColumns.map(c => c.column_name);
    if (forceDimension) {
        const physicalCol = resolvePhysicalColumn(forceDimension, schemaColumns);
        if (physicalCol) {
            return {
                canonicalKey: forceDimension,
                physicalCol,
                label: forceDimension.charAt(0).toUpperCase() + forceDimension.slice(1)
            };
        }
        console.warn(`[ContributionEngine] Cannot resolve physical column for forced dimension: ${forceDimension}`);
        return null;
    }
    // Try explicit dims from analysis first
    for (const dimKey of analysis.dimensions) {
        if (TIME_DIMENSIONS.has(dimKey))
            continue;
        const physicalCol = resolvePhysicalColumn(dimKey, schemaColumns);
        if (physicalCol) {
            return {
                canonicalKey: dimKey,
                physicalCol,
                label: dimKey.charAt(0).toUpperCase() + dimKey.slice(1)
            };
        }
    }
    // Fall back to priority-ordered auto-selection
    for (const dimKey of CONTRIBUTION_DIM_PRIORITY) {
        const physicalCol = resolvePhysicalColumn(dimKey, schemaColumns);
        if (physicalCol) {
            console.log(`[ContributionEngine] Auto-selected dimension: ${dimKey}`);
            return {
                canonicalKey: dimKey,
                physicalCol,
                label: dimKey.charAt(0).toUpperCase() + dimKey.slice(1)
            };
        }
    }
    return null;
}
// ─── Period detection ─────────────────────────────────────────────────────────
/**
 * Checks whether the analysis contains two comparable time periods.
 * Returns the pair if found, null otherwise.
 */
function detectPeriodPair(analysis, dateCol) {
    for (const timeDim of ["quarter", "month", "year"]) {
        const timeFilters = analysis.filters.filter(f => f.dimension === timeDim);
        if (timeFilters.length >= 2) {
            const vals = timeFilters.map(f => Number(f.value)).sort((a, b) => b - a);
            return {
                current: { timeDim, value: vals[0], dateCol },
                prior: { timeDim, value: vals[1], dateCol }
            };
        }
    }
    return null;
}
function buildPeriodCondition(spec) {
    const extract = `EXTRACT(${spec.timeDim.toUpperCase()} FROM STRPTIME("${spec.dateCol}", ${DATE_FORMAT}))`;
    return `${extract} = ${spec.value}`;
}
function periodLabel(spec) {
    if (spec.timeDim === "quarter")
        return `Q${spec.value}`;
    if (spec.timeDim === "month")
        return `Month ${spec.value}`;
    return `${spec.value}`;
}
// ─── WHERE clause helpers ─────────────────────────────────────────────────────
/**
 * Builds context filters — excludes time filters (handled by period CTEs)
 * and excludes the contribution dimension itself.
 */
function buildContextWhere(analysis, semanticLayer) {
    const schemaColumns = semanticLayer.allColumns.map(c => c.column_name);
    const contextFilters = analysis.filters.filter(f => !TIME_DIMENSIONS.has(f.dimension) && f.dimension !== "_entity");
    return buildWhereClause(contextFilters, schemaColumns);
}
function appendCondition(where, extra) {
    if (!where)
        return `WHERE ${extra}`;
    return `${where} AND ${extra}`;
}
// ─── SQL builders ─────────────────────────────────────────────────────────────
/**
 * Single-period contribution SQL.
 *
 * Strategy: weighted deviation from mean.
 *   contribution_pct = (dim_metric - overall_metric) × (dim_volume / total_volume)
 *
 * Positive → this member pulls the overall metric UP.
 * Negative → this member pulls the overall metric DOWN.
 *
 * Output columns:
 *   dimension_value, metric_value, overall_metric, vs_average,
 *   volume_share_pct, contribution_pct
 */
function buildSinglePeriodSql(dim, metric, where) {
    const w = where ? `\n    ${where}` : "";
    return [
        `WITH overall AS (`,
        `    SELECT`,
        `        COUNT(*) AS total_rows,`,
        `        ${metric.formula} AS overall_metric`,
        `    FROM data_table${w}`,
        `),`,
        `by_dim AS (`,
        `    SELECT`,
        `        "${dim.physicalCol}" AS dimension_value,`,
        `        COUNT(*) AS row_count,`,
        `        ${metric.formula} AS metric_value`,
        `    FROM data_table${w}`,
        `    GROUP BY "${dim.physicalCol}"`,
        `)`,
        `SELECT`,
        `    b.dimension_value AS "${dim.label}",`,
        `    b.row_count AS "Volume",`,
        `    ROUND(b.row_count * 100.0 / o.total_rows, 4) AS "Volume Share %",`,
        `    ROUND(b.metric_value, 4) AS "${metric.name}",`,
        `    ROUND(b.metric_value - o.overall_metric, 4) AS "Metric Delta",`,
        `    ROUND(`,
        `        (b.row_count * 1.0 / o.total_rows) * (b.metric_value - o.overall_metric),`,
        `        4`,
        `    ) AS "Weighted Contribution",`,
        `    0 AS "Contribution %",`,
        `    0 AS "Overall Metric Change"`,
        `FROM by_dim b`,
        `CROSS JOIN overall o`,
        `WHERE b.dimension_value IS NOT NULL`,
        `ORDER BY ABS("Weighted Contribution") DESC`,
        `LIMIT 25`
    ].join("\n");
}
/**
 * Two-period contribution SQL.
 *
 * Computes metric delta per dimension member between current and prior period,
 * then weights by current volume share to rank contributors to the change.
 *
 * Output columns:
 *   dimension_value,
 *   current_metric, prior_metric, metric_change,
 *   current_volume_share_pct,
 *   contribution_to_change_pct
 */
function buildTwoPeriodSql(dim, metric, current, prior, contextWhere) {
    const currentCond = buildPeriodCondition(current);
    const priorCond = buildPeriodCondition(prior);
    const currentWhere = appendCondition(contextWhere, currentCond);
    const priorWhere = appendCondition(contextWhere, priorCond);
    const cw = currentWhere ? `\n        ${currentWhere}` : "";
    const pw = priorWhere ? `\n        ${priorWhere}` : "";
    return [
        `WITH current_period AS (`,
        `    SELECT`,
        `        "${dim.physicalCol}" AS dimension_value,`,
        `        COUNT(*) AS row_count,`,
        `        ${metric.formula} AS metric_value`,
        `    FROM data_table${cw}`,
        `    GROUP BY "${dim.physicalCol}"`,
        `),`,
        `prior_period AS (`,
        `    SELECT`,
        `        "${dim.physicalCol}" AS dimension_value,`,
        `        COUNT(*) AS row_count,`,
        `        ${metric.formula} AS metric_value`,
        `    FROM data_table${pw}`,
        `    GROUP BY "${dim.physicalCol}"`,
        `),`,
        `volume_totals AS (`,
        `    SELECT `,
        `        (SELECT SUM(row_count) FROM current_period) AS total_current_rows,`,
        `        (SELECT SUM(row_count) FROM prior_period) AS total_prior_rows,`,
        `        (SELECT ${metric.formula} FROM data_table${cw}) AS overall_current_metric,`,
        `        (SELECT ${metric.formula} FROM data_table${pw}) AS overall_prior_metric`,
        `)`,
        `SELECT`,
        `    COALESCE(c.dimension_value, p.dimension_value) AS "${dim.label}",`,
        `    COALESCE(c.row_count, 0) AS "Volume",`,
        `    ROUND(COALESCE(c.row_count, 0) * 100.0 / NULLIF(v.total_current_rows, 0), 4) AS "Volume Share %",`,
        `    ROUND(COALESCE(c.metric_value, 0), 4) AS "${metric.name}",`,
        `    ROUND(COALESCE(c.metric_value, 0) - COALESCE(p.metric_value, 0), 4) AS "Metric Delta",`,
        `    ROUND(`,
        `        ((COALESCE(c.row_count, 0) * 1.0 / NULLIF(v.total_current_rows, 0)) * COALESCE(c.metric_value, 0))`,
        `        - ((COALESCE(p.row_count, 0) * 1.0 / NULLIF(v.total_prior_rows, 0)) * COALESCE(p.metric_value, 0)),`,
        `        4`,
        `    ) AS "Weighted Contribution",`,
        `    ROUND(`,
        `        (`,
        `            (((COALESCE(c.row_count, 0) * 1.0 / NULLIF(v.total_current_rows, 0)) * COALESCE(c.metric_value, 0))`,
        `            - ((COALESCE(p.row_count, 0) * 1.0 / NULLIF(v.total_prior_rows, 0)) * COALESCE(p.metric_value, 0)))`,
        `            / NULLIF(ABS(v.overall_current_metric - v.overall_prior_metric), 0)`,
        `        ) * 100,`,
        `        4`,
        `    ) AS "Contribution %",`,
        `    ROUND(v.overall_current_metric - v.overall_prior_metric, 4) AS "Overall Metric Change"`,
        `FROM current_period c`,
        `FULL OUTER JOIN prior_period p USING (dimension_value)`,
        `CROSS JOIN volume_totals v`,
        `WHERE COALESCE(c.dimension_value, p.dimension_value) IS NOT NULL`,
        `ORDER BY ABS("Weighted Contribution") DESC`,
        `LIMIT 25`
    ].join("\n");
}
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Contribution Engine
 *
 * Generates deterministic contribution-ranking SQL for ROOT_CAUSE / BREAKDOWN
 * intent questions. No LLM — fully rule-based.
 *
 * Supported patterns:
 *  - "which hotels contributed most to the decline"
 *     → single-period: rank all hotels by weighted deviation from mean
 *  - "which chains drove the increase in Q2 vs Q1"
 *     → two-period: compute metric delta per chain × current volume share
 *  - "top contributors to win rate drop"
 *     → auto-selects best available dimension (hotel → chain → supplier → …)
 *  - "supplier contribution analysis"
 *     → single-period with supplier grouping
 *
 * Output always includes:
 *  - metric value per member
 *  - volume share %
 *  - contribution % (signed: positive = pulling metric up, negative = down)
 *  - ranked by ABS(contribution) so top 25 biggest movers appear first
 *
 * Returns null if metric or grouping dimension cannot be resolved.
 */
export function generateContributionSql(analysis, semanticLayer, forceDimension) {
    // ── 1. Resolve metric ──────────────────────────────────────────────────────
    const metric = resolveMetric(analysis, semanticLayer);
    if (!metric) {
        console.warn("[ContributionEngine] Cannot resolve metric — returning null.");
        return null;
    }
    // ── 2. Resolve grouping dimension ──────────────────────────────────────────
    const dim = resolveContributionDimension(analysis, semanticLayer, forceDimension);
    if (!dim) {
        console.warn("[ContributionEngine] Cannot resolve grouping dimension — returning null.");
        return null;
    }
    console.log(`[ContributionEngine] Metric: ${metric.name} | Dimension: ${dim.canonicalKey} | ` +
        `Column: "${dim.physicalCol}"`);
    // ── 3. Detect time column (needed for period comparisons) ──────────────────
    const dateCol = semanticLayer.primaryTimeDimension
        || semanticLayer.availableTimeColumns?.[0]
        || "";
    // ── 4. Detect period pair (optional) ──────────────────────────────────────
    const periods = dateCol ? detectPeriodPair(analysis, dateCol) : null;
    // ── 5. Build context WHERE (non-time, non-entity shared filters) ───────────
    const contextWhere = buildContextWhere(analysis, semanticLayer);
    if (contextWhere) {
        console.log(`[ContributionEngine] Context WHERE: ${contextWhere}`);
    }
    // ── 6. Generate SQL ────────────────────────────────────────────────────────
    let sql;
    let explanation;
    if (periods) {
        // Two-period: contribution to change between current and prior period
        sql = buildTwoPeriodSql(dim, metric, periods.current, periods.prior, contextWhere);
        explanation =
            `Contribution analysis of ${metric.name} by ${dim.label} — ` +
                `comparing ${periodLabel(periods.current)} vs ${periodLabel(periods.prior)}. ` +
                `Ranked by absolute weighted contribution to the overall metric change. ` +
                `Positive = drove increase; negative = drove decline.`;
        console.log(`[ContributionEngine] Mode: two-period | ` +
            `${periodLabel(periods.current)} vs ${periodLabel(periods.prior)}`);
    }
    else {
        // Single-period: weighted deviation from the overall mean
        sql = buildSinglePeriodSql(dim, metric, contextWhere);
        const filterNote = contextWhere
            ? ` (filtered)`
            : "";
        explanation =
            `Contribution analysis of ${metric.name} by ${dim.label}${filterNote}. ` +
                `Each member's contribution % = (its metric − overall average) × its volume share. ` +
                `Positive = pulling metric up; negative = pulling metric down. ` +
                `Ranked by absolute contribution, top 25 shown.`;
        console.log(`[ContributionEngine] Mode: single-period`);
    }
    return { sql, explanation };
}
