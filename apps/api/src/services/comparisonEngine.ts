import { QuestionAnalysis, QuestionFilter } from "../ai/questionTypes.js";
import { EnrichedSemanticLayer } from "../ai/semanticLayer.js";
import { resolvePhysicalColumn } from "../ai/dimensionRegistry.js";
import { buildWhereClause } from "../ai/filterBuilder.js";
import { dedupeFilters, resolveOrDiscardEntities } from "../ai/entityResolver.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComparisonResult {
    sql: string;
    explanation: string;
}

export interface ComparisonEntities {
    /** Canonical dimension key (e.g. "supplier", "destination") */
    dimension: string;
    /** Physical column name in the schema */
    physicalCol: string;
    /** Left side value */
    left: string;
    /** Right side value */
    right: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DATE_FORMAT = `'%m/%d/%Y'`;
const TIME_DIMS = new Set(["quarter", "month", "year", "time"]);

/** Canonical dimensions eligible for entity comparison, in priority order. */
const ENTITY_DIMS = [
    "thirdparty",
    "destination",
    "supplier",
    "hotel",
    "chain",
    "country",
    "city",
    "apw"
] as const;

// ─── Date expression ──────────────────────────────────────────────────────────

function strptime(col: string): string {
    return `STRPTIME("${col}", ${DATE_FORMAT})`;
}

// ─── Metric resolution ────────────────────────────────────────────────────────

function resolveMetric(
    analysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer
): { formula: string; name: string } | null {
    let metricKeys = analysis.metrics;

    if (metricKeys.length === 0) {
        const primary = semanticLayer.metricKeys[0];
        if (!primary) return null;
        metricKeys = [primary];
        console.log(`[ComparisonEngine] Inferred primary metric: ${primary}`);
    }

    if (metricKeys.length !== 1) return null;

    const metricKey = metricKeys[0];
    const metric = semanticLayer.metrics.find(m =>
        m.name.toLowerCase().replace(/\s+/g, "_") === metricKey ||
        m.name.toLowerCase().includes(metricKey.replace(/_/g, " "))
    );

    if (!metric) {
        console.warn(`[ComparisonEngine] Metric '${metricKey}' not found in semantic layer.`);
        return null;
    }

    return { formula: metric.formula, name: metric.name };
}

// ─── Comparison Entity Extraction ─────────────────────────────────────────────

/**
 * Extracts exactly two comparable entities from the analysis.
 *
 * Strategy (priority order):
 *  1. Two filters on the same canonical dimension (supplier, destination, etc.)
 *  2. Two time-period filters (quarter, month, year)
 *  3. Two _entity (unclassified) filters
 *
 * Returns null if two sides cannot be identified, with a detailed reason logged.
 */
export function extractComparisonEntities(
    analysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer
): ComparisonEntities | null {
    const schemaColumns = semanticLayer.allColumns.map(c => c.column_name);

    // Deduplicate filters first — prevents duplicate entity detection from
    // creating false positives (e.g. Affiliate appears twice → only two unique)
    const filters = dedupeFilters(analysis.filters);

    console.log(
        `[ComparisonEngine] COMPARISON_DEBUG\n` +
        `  FILTERS (raw):    ${JSON.stringify(analysis.filters.map(f => `${f.dimension}=${f.value}`))}\n` +
        `  FILTERS (deduped): ${JSON.stringify(filters.map(f => `${f.dimension}=${f.value}`))}`
    );

    // ── Strategy 1: Same canonical dimension ──────────────────────────────────
    for (const dim of ENTITY_DIMS) {
        const dimFilters = filters.filter(f => f.dimension === dim);

        if (dimFilters.length >= 2) {
            const left  = String(dimFilters[0].value);
            const right = String(dimFilters[1].value);

            const physicalCol = resolvePhysicalColumn(dim, schemaColumns);
            if (!physicalCol) {
                console.warn(`[ComparisonEngine] Cannot resolve physical column for dim="${dim}"`);
                continue;
            }

            console.log(
                `[ComparisonEngine]\n` +
                `  COMPARISON_DIMENSION: ${dim}\n` +
                `  PHYSICAL_COLUMN:      ${physicalCol}\n` +
                `  LEFT:  ${left}\n` +
                `  RIGHT: ${right}`
            );

            return { dimension: dim, physicalCol, left, right };
        }
    }

    // ── Strategy 2: Time period comparison ────────────────────────────────────
    // (handled separately in generateComparisonSql — not returned as entities)

    // ── Strategy 3: _entity filters ───────────────────────────────────────────
    const entityFilters = filters.filter(f => f.dimension === "_entity");
    if (entityFilters.length >= 2) {
        const left  = String(entityFilters[0].value);
        const right = String(entityFilters[1].value);

        console.log(
            `[ComparisonEngine]\n` +
            `  COMPARISON_DIMENSION: _entity (ILIKE across all VARCHAR columns)\n` +
            `  LEFT:  ${left}\n` +
            `  RIGHT: ${right}`
        );

        // For entity fallback, physicalCol is a sentinel — actual condition uses ILIKE
        return { dimension: "_entity", physicalCol: "_entity", left, right };
    }

    // ── Failure — log diagnostics ──────────────────────────────────────────────
    const filterSummary = filters.map(f => `${f.dimension}=${f.value}`).join(", ") || "(none)";
    const dimCounts = ENTITY_DIMS.map(d => {
        const n = filters.filter(f => f.dimension === d).length;
        return `${d}:${n}`;
    }).join(", ");

    console.warn(
        `[ComparisonEngine] COMPARISON_DEBUG — FAILED\n` +
        `  FILTERS:    ${filterSummary}\n` +
        `  DIM_COUNTS: ${dimCounts}\n` +
        `  FAIL_REASON: No dimension had >= 2 unique values for comparison.\n` +
        `  NOTE: Check that entityResolver is using canonical dimension names.`
    );

    return null;
}

// ─── Period comparison helpers ────────────────────────────────────────────────

interface ComparisonSide {
    label: string;
    condition: string;
}

function buildPeriodSides(
    analysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer,
    filters: QuestionFilter[]
): [ComparisonSide, ComparisonSide] | null {
    const timeCol = semanticLayer.primaryTimeDimension
        || semanticLayer.availableTimeColumns?.[0]
        || "";

    if (!timeCol) return null;

    for (const timeDim of ["quarter", "month", "year"] as const) {
        const timeFilters = filters.filter(f => f.dimension === timeDim);
        if (timeFilters.length < 2) continue;

        const aVal = Number(timeFilters[0].value);
        const bVal = Number(timeFilters[1].value);

        let condA: string, condB: string, prefix: string;

        if (timeDim === "quarter") {
            condA = `EXTRACT(QUARTER FROM ${strptime(timeCol)}) = ${aVal}`;
            condB = `EXTRACT(QUARTER FROM ${strptime(timeCol)}) = ${bVal}`;
            prefix = "Q";
        } else if (timeDim === "month") {
            condA = `EXTRACT(MONTH FROM ${strptime(timeCol)}) = ${aVal}`;
            condB = `EXTRACT(MONTH FROM ${strptime(timeCol)}) = ${bVal}`;
            prefix = "Month ";
        } else {
            condA = `EXTRACT(YEAR FROM ${strptime(timeCol)}) = ${aVal}`;
            condB = `EXTRACT(YEAR FROM ${strptime(timeCol)}) = ${bVal}`;
            prefix = "";
        }

        console.log(`[ComparisonEngine] Period comparison: ${timeDim} ${aVal} vs ${bVal}`);
        return [
            { label: `${prefix}${aVal}`, condition: condA },
            { label: `${prefix}${bVal}`, condition: condB }
        ];
    }

    return null;
}

// ─── SQL builders ─────────────────────────────────────────────────────────────

/**
 * Primary path: single IN-clause grouping SQL.
 * Used when two entities share the same canonical dimension.
 *
 * Example:
 *   SELECT "suppliername", AVG(...) AS "Win Rate"
 *   FROM data_table
 *   WHERE "suppliername" IN ('Affiliate', 'Synxis')
 *   [AND <shared_filters>]
 *   GROUP BY "suppliername"
 *   ORDER BY "suppliername"
 */
function buildInClauseSql(
    entities: ComparisonEntities,
    metric: { formula: string; name: string },
    sharedWhere: string
): string {
    const safeLeft  = entities.left.replace(/'/g, "''");
    const safeRight = entities.right.replace(/'/g, "''");
    const col = `"${entities.physicalCol}"`;

    const inCondition = `${col} IN ('${safeLeft}', '${safeRight}')`;
    const whereClause = sharedWhere
        ? `WHERE ${inCondition} AND (${sharedWhere.replace(/^WHERE\s+/i, "")})`
        : `WHERE ${inCondition}`;

    return [
        `SELECT`,
        `    ${col} AS entity,`,
        `    ${metric.formula} AS "${metric.name}"`,
        `FROM data_table`,
        whereClause,
        `GROUP BY ${col}`,
        `ORDER BY ${col}`
    ].join("\n");
}

/**
 * Fallback path: two-CTE UNION ALL SQL.
 * Used for period comparisons and _entity (ILIKE) comparisons.
 */
function buildCTESql(
    sideA: ComparisonSide,
    sideB: ComparisonSide,
    metric: { formula: string; name: string },
    sharedWhere: string
): string {
    const sharedFilter = sharedWhere
        ? ` AND (${sharedWhere.replace(/^WHERE\s+/i, "")})`
        : "";

    const safeA = sideA.label.replace(/'/g, "''");
    const safeB = sideB.label.replace(/'/g, "''");

    return [
        `WITH side_a AS (`,
        `    SELECT`,
        `        '${safeA}' AS entity,`,
        `        ${metric.formula} AS "${metric.name}"`,
        `    FROM data_table`,
        `    WHERE ${sideA.condition}${sharedFilter}`,
        `),`,
        `side_b AS (`,
        `    SELECT`,
        `        '${safeB}' AS entity,`,
        `        ${metric.formula} AS "${metric.name}"`,
        `    FROM data_table`,
        `    WHERE ${sideB.condition}${sharedFilter}`,
        `)`,
        `SELECT * FROM side_a`,
        `UNION ALL`,
        `SELECT * FROM side_b`,
        `ORDER BY entity`
    ].join("\n");
}

/**
 * Builds an ILIKE condition across all VARCHAR columns (for _entity comparisons).
 */
function buildEntityIlikeCondition(
    value: string,
    semanticLayer: EnrichedSemanticLayer
): string {
    const safe = value.replace(/'/g, "''");
    const stringCols = semanticLayer.allColumns.filter(c =>
        c.column_type.toUpperCase().includes("VARCHAR") ||
        c.column_type.toUpperCase().includes("STRING") ||
        c.column_type.toUpperCase().includes("TEXT")
    );
    const checks = stringCols.map(c => `"${c.column_name}" ILIKE '%${safe}%'`).join(" OR ");
    return `(${checks})`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Comparison Engine
 *
 * Generates deterministic side-by-side comparison SQL.
 * No LLM involved — fully rule-based.
 *
 * Supported patterns:
 *  - "compare suppliers Affiliate with Synxis"   → IN-clause on suppliername ✓
 *  - "compare London vs Bangkok"                 → IN-clause on destination ✓
 *  - "compare chain A vs chain B"                → IN-clause on tbo_chainname ✓
 *  - "compare Q1 vs Q2"                          → two-CTE period comparison ✓
 *  - "compare 2024 vs 2025"                      → two-CTE year comparison ✓
 *
 * SQL Strategy:
 *  - Same canonical dimension → IN-clause GROUP BY (cleaner, single pass)
 *  - Period or _entity comparison → two-CTE UNION ALL
 */
export function generateComparisonSql(
    analysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer
): ComparisonResult | null {
    // Resolve/discard placeholder entity filters
    analysis.filters = resolveOrDiscardEntities(
        analysis.filters,
        analysis.focus,
        semanticLayer.dimensions
    );

    // ── 1. Resolve metric ──────────────────────────────────────────────────────
    const metric = resolveMetric(analysis, semanticLayer);
    if (!metric) {
        console.warn("[ComparisonEngine] Cannot resolve metric — returning null.");
        return null;
    }

    // ── 2. Deduplicate filters ─────────────────────────────────────────────────
    const deduped = dedupeFilters(analysis.filters);
    const schemaColumns = semanticLayer.allColumns.map(c => c.column_name);

    // ── 3a. Try same-dimension entity comparison (IN-clause path) ──────────────
    const entities = extractComparisonEntities(
        { ...analysis, filters: deduped },
        semanticLayer
    );

    if (entities && entities.dimension !== "_entity") {
        // Shared filters: everything except the comparison dimension
        const sharedFilters = deduped.filter(
            f => f.dimension !== entities.dimension && !TIME_DIMS.has(f.dimension)
        );
        const sharedWhere = buildWhereClause(sharedFilters, schemaColumns);

        if (sharedWhere) {
            console.log(`[ComparisonEngine] Shared WHERE: ${sharedWhere}`);
        }

        const sql = buildInClauseSql(entities, metric, sharedWhere);
        const explanation =
            `Comparing ${metric.name} for "${entities.left}" vs "${entities.right}" ` +
            `by ${entities.dimension}.`;

        console.log(
            `[ComparisonEngine] IN-clause SQL generated | ` +
            `dim=${entities.dimension} | "${entities.left}" vs "${entities.right}" | ` +
            `metric=${metric.name}`
        );

        return { sql, explanation };
    }

    // ── 3b. Try period comparison (CTE path) ───────────────────────────────────
    const periodSides = buildPeriodSides(analysis, semanticLayer, deduped);
    if (periodSides) {
        const [sideA, sideB] = periodSides;

        // Detect which time dim was used
        const usedTimeDim = (["quarter", "month", "year"] as const).find(
            td => deduped.filter(f => f.dimension === td).length >= 2
        );
        const sharedFilters = deduped.filter(
            f => f.dimension !== usedTimeDim && !TIME_DIMS.has(f.dimension) && f.dimension !== "_entity"
        );
        const sharedWhere = buildWhereClause(sharedFilters, schemaColumns);

        const sql = buildCTESql(sideA, sideB, metric, sharedWhere);
        const explanation = `Comparing ${metric.name}: ${sideA.label} vs ${sideB.label}.`;

        return { sql, explanation };
    }

    // ── 3c. _entity fallback (CTE + ILIKE path) ────────────────────────────────
    if (entities && entities.dimension === "_entity") {
        const sideA: ComparisonSide = {
            label: entities.left,
            condition: buildEntityIlikeCondition(entities.left, semanticLayer)
        };
        const sideB: ComparisonSide = {
            label: entities.right,
            condition: buildEntityIlikeCondition(entities.right, semanticLayer)
        };

        const sharedFilters = deduped.filter(
            f => f.dimension !== "_entity" && !TIME_DIMS.has(f.dimension)
        );
        const sharedWhere = buildWhereClause(sharedFilters, schemaColumns);

        const sql = buildCTESql(sideA, sideB, metric, sharedWhere);
        const explanation =
            `Comparing ${metric.name} for "${entities.left}" vs "${entities.right}".`;

        console.log(
            `[ComparisonEngine] ILIKE CTE SQL generated | ` +
            `"${entities.left}" vs "${entities.right}"`
        );

        return { sql, explanation };
    }

    // ── 4. Failure ─────────────────────────────────────────────────────────────
    console.warn(
        `[ComparisonEngine] COMPARISON_DEBUG — FINAL FAILURE\n` +
        `  METRIC:  ${metric.name}\n` +
        `  FILTERS: ${deduped.map(f => `${f.dimension}=${f.value}`).join(", ") || "(none)"}\n` +
        `  FAIL_REASON: No two comparable sides could be identified after deduplication.\n` +
        `  CHECK: entityResolver must emit canonical dimension names (supplier, not suppliername).`
    );

    return null;
}
