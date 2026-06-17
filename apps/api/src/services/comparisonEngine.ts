import { QuestionAnalysis, QuestionFilter } from "../ai/questionTypes.js";
import { EnrichedSemanticLayer } from "../ai/semanticLayer.js";
import { resolvePhysicalColumn } from "../ai/dimensionRegistry.js";
import { buildWhereClause } from "../ai/filterBuilder.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComparisonResult {
    sql: string;
    explanation: string;
}

/**
 * Represents one side of a comparison (entity OR time period).
 */
interface ComparisonSide {
    /** Human-readable label shown in the result set */
    label: string;

    /** The WHERE condition that isolates this side */
    condition: string;
}

// ─── Date expression (VARCHAR → DuckDB timestamp) ─────────────────────────────

const DATE_FORMAT = `'%m/%d/%Y'`;

function strptime(col: string): string {
    return `STRPTIME("${col}", ${DATE_FORMAT})`;
}

// ─── Period comparison helpers ────────────────────────────────────────────────

/**
 * Quarter number → month ranges for the WHERE condition.
 * DuckDB: EXTRACT(QUARTER FROM ...) is supported natively.
 */
function buildQuarterCondition(dateCol: string, quarter: number): string {
    return `EXTRACT(QUARTER FROM ${strptime(dateCol)}) = ${quarter}`;
}

function buildMonthCondition(dateCol: string, month: number): string {
    return `EXTRACT(MONTH FROM ${strptime(dateCol)}) = ${month}`;
}

function buildYearCondition(dateCol: string, year: number): string {
    return `EXTRACT(YEAR FROM ${strptime(dateCol)}) = ${year}`;
}

// ─── Entity condition helpers ─────────────────────────────────────────────────

/**
 * Builds an ILIKE or exact-match condition for a named entity filter
 * resolved against all VARCHAR columns in the schema.
 */
function buildEntityCondition(
    value: string,
    semanticLayer: EnrichedSemanticLayer
): string {
    const safe = value.replace(/'/g, "''");
    const stringCols = semanticLayer.allColumns.filter(c =>
        c.column_type.toUpperCase().includes("VARCHAR") ||
        c.column_type.toUpperCase().includes("STRING") ||
        c.column_type.toUpperCase().includes("TEXT")
    );
    const checks = stringCols
        .map(c => `"${c.column_name}" ILIKE '%${safe}%'`)
        .join(" OR ");
    return `(${checks})`;
}

/**
 * Builds an ILIKE or exact condition for a typed dimension filter
 * (destination, supplier, chain, hotel, etc.)
 */
function buildTypedEntityCondition(
    dimension: string,
    value: string,
    semanticLayer: EnrichedSemanticLayer
): string {
    const schemaColumns = semanticLayer.allColumns.map(c => c.column_name);
    const physicalCol = resolvePhysicalColumn(dimension, schemaColumns);
    if (!physicalCol) {
        // Fallback to entity-style ILIKE across all VARCHAR columns
        return buildEntityCondition(value, semanticLayer);
    }
    const safe = value.replace(/'/g, "''");
    return `"${physicalCol}" ILIKE '%${safe}%'`;
}

// ─── Side Extraction ──────────────────────────────────────────────────────────

/**
 * Extracts exactly two comparison sides from the question analysis.
 *
 * Strategy (in priority order):
 *  1. Time period comparisons — two numeric filters on month/quarter/year
 *  2. Typed dimension comparisons — two filters on the same dimension
 *     (destination, supplier, hotel, chain, etc.)
 *  3. Entity comparisons — two _entity filters (unclassified proper nouns)
 *
 * Returns null if fewer than two comparable sides can be identified.
 */
function extractComparisonSides(
    analysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer
): [ComparisonSide, ComparisonSide] | null {

    const timeCol = semanticLayer.primaryTimeDimension
        || semanticLayer.availableTimeColumns?.[0]
        || "";

    // ── Strategy 1: Time period comparisons ───────────────────────────────────
    const timeDims = ["quarter", "month", "year"] as const;

    for (const timeDim of timeDims) {
        const timeFilters = analysis.filters.filter(f => f.dimension === timeDim);

        if (timeFilters.length >= 2 && timeCol) {
            const [a, b] = timeFilters;
            const aVal = Number(a.value);
            const bVal = Number(b.value);

            let condA: string, condB: string, labelPrefix: string;

            if (timeDim === "quarter") {
                condA = buildQuarterCondition(timeCol, aVal);
                condB = buildQuarterCondition(timeCol, bVal);
                labelPrefix = "Q";
            } else if (timeDim === "month") {
                condA = buildMonthCondition(timeCol, aVal);
                condB = buildMonthCondition(timeCol, bVal);
                labelPrefix = "Month ";
            } else {
                condA = buildYearCondition(timeCol, aVal);
                condB = buildYearCondition(timeCol, bVal);
                labelPrefix = "";
            }

            console.log(`[ComparisonEngine] Period comparison: ${timeDim} ${aVal} vs ${bVal}`);

            return [
                { label: `${labelPrefix}${aVal}`, condition: condA },
                { label: `${labelPrefix}${bVal}`, condition: condB }
            ];
        }
    }

    // ── Strategy 2: Typed dimension comparisons ───────────────────────────────
    const COMPARABLE_DIMS = ["destination", "supplier", "hotel", "chain", "country", "city", "apw"];

    for (const dim of COMPARABLE_DIMS) {
        const dimFilters = analysis.filters.filter(f => f.dimension === dim);

        if (dimFilters.length >= 2) {
            const [a, b] = dimFilters;
            const aStr = String(a.value);
            const bStr = String(b.value);

            console.log(`[ComparisonEngine] Typed comparison on '${dim}': "${aStr}" vs "${bStr}"`);

            return [
                {
                    label: aStr,
                    condition: buildTypedEntityCondition(dim, aStr, semanticLayer)
                },
                {
                    label: bStr,
                    condition: buildTypedEntityCondition(dim, bStr, semanticLayer)
                }
            ];
        }
    }

    // ── Strategy 3: Entity comparisons (unclassified proper nouns) ────────────
    const entityFilters = analysis.filters.filter(f => f.dimension === "_entity");

    if (entityFilters.length >= 2) {
        const [a, b] = entityFilters;
        const aStr = String(a.value);
        const bStr = String(b.value);

        console.log(`[ComparisonEngine] Entity comparison: "${aStr}" vs "${bStr}"`);

        return [
            {
                label: aStr,
                condition: buildEntityCondition(aStr, semanticLayer)
            },
            {
                label: bStr,
                condition: buildEntityCondition(bStr, semanticLayer)
            }
        ];
    }

    return null;
}

// ─── Shared filter extraction ─────────────────────────────────────────────────

/**
 * Extracts filters that apply to BOTH sides (background context filters),
 * excluding the filters that were used to define the comparison sides themselves.
 *
 * For example: "compare London vs Bangkok for Q1"
 * → side filters: destination=London, destination=Bangkok
 * → shared filter: quarter=1 (applied to both CTE subqueries)
 */
function extractSharedFilters(
    analysis: QuestionAnalysis,
    usedDimensions: Set<string>
): QuestionFilter[] {
    return analysis.filters.filter(f => !usedDimensions.has(f.dimension));
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

// ─── SQL Assembly ─────────────────────────────────────────────────────────────

/**
 * Builds the comparison SQL using two CTEs — one per side — then UNIONs them.
 *
 * Pattern:
 *
 *   WITH side_a AS (
 *       SELECT 'LabelA' AS entity, <metric> AS "<MetricName>"
 *       FROM data_table
 *       WHERE <side_a_condition> [AND <shared_filters>]
 *   ),
 *   side_b AS (
 *       SELECT 'LabelB' AS entity, <metric> AS "<MetricName>"
 *       FROM data_table
 *       WHERE <side_b_condition> [AND <shared_filters>]
 *   )
 *   SELECT * FROM side_a
 *   UNION ALL
 *   SELECT * FROM side_b
 *   ORDER BY entity
 */
function assembleSql(
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Comparison Engine
 *
 * Generates deterministic side-by-side comparison SQL for COMPARISON intent.
 * No LLM involved — fully rule-based from QuestionAnalysis + SemanticLayer.
 *
 * Supported patterns:
 *  - "compare London vs Bangkok"         → entity comparison across all VARCHAR cols
 *  - "compare supplier A vs supplier B"  → typed dimension comparison
 *  - "compare Q1 vs Q2"                  → quarter period comparison
 *  - "compare chain A vs chain B"        → typed dimension comparison
 *  - "compare 2024 vs 2025"              → year comparison
 *  - "compare Jan vs Apr win rate"       → month comparison on specific metric
 *
 * Output: two-row result (one per side) via UNION ALL of two CTEs.
 * Returns null if two comparable sides cannot be identified.
 */
export function generateComparisonSql(
    analysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer
): ComparisonResult | null {

    // ── 1. Resolve metric ──────────────────────────────────────────────────────
    const metric = resolveMetric(analysis, semanticLayer);
    if (!metric) {
        console.warn("[ComparisonEngine] Cannot resolve metric — returning null.");
        return null;
    }

    // ── 2. Extract comparison sides ────────────────────────────────────────────
    const sides = extractComparisonSides(analysis, semanticLayer);
    if (!sides) {
        console.warn("[ComparisonEngine] Cannot identify two comparable sides — returning null.");
        return null;
    }

    const [sideA, sideB] = sides;

    // ── 3. Determine which dimensions were consumed as sides ───────────────────
    // Time period comparisons consume one time dimension; entity comparisons consume _entity.
    // Anything else becomes a shared (background) filter.
    const TIME_DIMS = new Set(["quarter", "month", "year", "time"]);
    const ENTITY_DIM = "_entity";
    const COMPARABLE_DIMS = new Set(["destination", "supplier", "hotel", "chain", "country", "city", "apw"]);

    // Figure out which dimension was used as comparison axis
    const usedDimensions = new Set<string>();

    for (const timeDim of ["quarter", "month", "year"]) {
        const timeFilters = analysis.filters.filter(f => f.dimension === timeDim);
        if (timeFilters.length >= 2) {
            usedDimensions.add(timeDim);
            break;
        }
    }

    if (usedDimensions.size === 0) {
        for (const dim of COMPARABLE_DIMS) {
            const dimFilters = analysis.filters.filter(f => f.dimension === dim);
            if (dimFilters.length >= 2) {
                usedDimensions.add(dim);
                break;
            }
        }
    }

    if (usedDimensions.size === 0) {
        const entityFilters = analysis.filters.filter(f => f.dimension === ENTITY_DIM);
        if (entityFilters.length >= 2) usedDimensions.add(ENTITY_DIM);
    }

    // ── 4. Build shared WHERE clause ───────────────────────────────────────────
    // Filters NOT consumed as comparison sides apply to both CTE subqueries.
    const sharedFilters = extractSharedFilters(analysis, usedDimensions);
    const schemaColumns = semanticLayer.allColumns.map(c => c.column_name);

    // Exclude any remaining time/entity filters from shared WHERE — they're handled above
    const typedShared = sharedFilters.filter(
        f => !TIME_DIMS.has(f.dimension) && f.dimension !== ENTITY_DIM
    );
    const sharedWhere = buildWhereClause(typedShared, schemaColumns);

    if (sharedWhere) {
        console.log(`[ComparisonEngine] Shared WHERE: ${sharedWhere}`);
    }

    // ── 5. Assemble SQL ────────────────────────────────────────────────────────
    const sql = assembleSql(sideA, sideB, metric, sharedWhere);

    // ── 6. Build explanation ───────────────────────────────────────────────────
    const sharedNote = typedShared.length > 0
        ? ` (with ${typedShared.length} shared filter${typedShared.length > 1 ? "s" : ""})`
        : "";

    const explanation =
        `Comparing ${metric.name} for "${sideA.label}" vs "${sideB.label}"${sharedNote}.`;

    console.log(
        `[ComparisonEngine] "${sideA.label}" vs "${sideB.label}" | Metric: ${metric.name}`
    );

    return { sql, explanation };
}
