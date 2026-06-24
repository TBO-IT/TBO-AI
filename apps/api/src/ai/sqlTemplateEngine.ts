import { QuestionAnalysis, QuestionFilter } from "./questionTypes.js";
import { EnrichedSemanticLayer } from "./semanticLayer.js";
import { buildWhereClause, buildFilterCondition } from "./filterBuilder.js";
import { detectSortDirection as polaritySortDirection } from "./queryPolarity.js";

/**
 * Resolves a canonical dimension key (e.g. "apw") to the physical column name
 * in the dataset (e.g. "apw_bucket_new") using the semantic layer's reversed columnMappings.
 */
function getPhysicalColumnName(canonicalKey: string, semanticLayer: EnrichedSemanticLayer): string {
    // columnMappings is { physicalCol -> canonicalKey }; we need the reverse
    const entry = Object.entries(semanticLayer.columnMappings).find(([, canonical]) => canonical === canonicalKey);
    if (entry) return entry[0];
    // Fallback: direct match on column name
    const direct = semanticLayer.allColumns.find(c => c.column_name.toLowerCase() === canonicalKey.toLowerCase());
    return direct ? direct.column_name : canonicalKey;
}

/**
 * Determines sort direction from question polarity.
 * NEGATIVE → ASC (worst first), POSITIVE → DESC (best first)
 */
function detectSortDirection(question: string): "ASC" | "DESC" {
    return polaritySortDirection(question);
}

/**
 * Resolves "_entity" (unclassified named-entity) filters into conditions across
 * all VARCHAR columns in the schema. Used as a safe fallback for proper nouns
 * like city/supplier names that weren't matched to a specific dimension.
 */
function buildEntityFilterConditions(
    entityFilters: QuestionFilter[],
    semanticLayer: EnrichedSemanticLayer
): string {
    if (entityFilters.length === 0) return "";

    const stringCols = semanticLayer.allColumns.filter(c =>
        c.column_type.toUpperCase().includes("VARCHAR") ||
        c.column_type.toUpperCase().includes("STRING") ||
        c.column_type.toUpperCase().includes("TEXT")
    );
    if (stringCols.length === 0) return "";

    const conditions = entityFilters.map(f => {
        const safe = String(f.value).replace(/'/g, "''");
        const colChecks = stringCols.map(c => `"${c.column_name}" ILIKE '%${safe}%'`).join(" OR ");
        return `(${colChecks})`;
    });

    return conditions.join(" AND ");
}

/**
 * Attempts to generate SQL deterministically for simple questions.
 * Returns the SQL string if successful, or null if too complex (needs Claude).
 *
 * Filter Architecture:
 * - Typed filters (dimension="apw", "destination", etc.) → filterBuilder.ts resolves physical column
 * - Unclassified entity filters (dimension="_entity") → matched via ILIKE against all VARCHAR cols
 * - All filters are applied in the WHERE clause — none are silently dropped
 */
export function generateTemplatedSql(
    analysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer
): string | null {
    const { intent, dimensions, filters, timeReferences } = analysis;
    let { metrics } = analysis;

    // ── 1. Metric Inference ───────────────────────────────────────────────────
    // For questions like "worst apw" that name a dimension but no metric,
    // infer the dataset's primary metric (e.g. win_rate for COMPETITIVENESS).
    if (metrics.length === 0) {
        const primaryMetricKey = semanticLayer.metricKeys[0];
        if (primaryMetricKey) {
            metrics = [primaryMetricKey];
            console.log(`[TemplateEngine] Inferred primary metric: ${primaryMetricKey}`);
        } else {
            return null;
        }
    }

    if (metrics.length !== 1) return null;

    const metricKey = metrics[0];
    const metric = semanticLayer.metrics.find(m =>
        m.name.toLowerCase().replace(/\s+/g, "_") === metricKey ||
        m.name.toLowerCase().includes(metricKey.replace(/_/g, " "))
    );

    if (!metric) {
        console.warn(`[TemplateEngine] Metric '${metricKey}' not found in semantic layer.`);
        return null;
    }

    const metricFormula = metric.formula;
    const sortDir = detectSortDirection(analysis.originalQuestion);
    const schemaColumns = semanticLayer.allColumns.map(c => c.column_name);

    // ── 2. WHERE clause from structured filters ───────────────────────────────
    const typedFilters = filters.filter(f => f.dimension !== "_entity");
    const entityFilters = filters.filter(f => f.dimension === "_entity");

    const typedWhere = buildWhereClause(typedFilters, schemaColumns);
    const entityConditions = buildEntityFilterConditions(entityFilters, semanticLayer);

    let whereClause = "";
    if (typedWhere && entityConditions) {
        whereClause = `${typedWhere} AND ${entityConditions}`;
    } else if (typedWhere) {
        whereClause = typedWhere;
    } else if (entityConditions) {
        whereClause = `WHERE ${entityConditions}`;
    }

    // Log filter propagation
    if (filters.length > 0) {
        console.log(`[TemplateEngine] SQL_FILTERS: ${whereClause || "(none resolved)"}`);
    }

    // ── 3. SELECT / GROUP BY (dimensions + optional time bucketing) ───────────
    let selectDims = "";
    let groupBy = "";

    if (dimensions.length > 0) {
        const dimCols = dimensions.map(d => getPhysicalColumnName(d, semanticLayer));
        console.log(`[TemplateEngine] Dim columns: ${JSON.stringify(Object.fromEntries(dimensions.map((d, i) => [d, dimCols[i]])))}`);
        selectDims = dimCols.map(c => `"${c}"`).join(", ") + ", ";
        groupBy = `GROUP BY ${dimCols.map(c => `"${c}"`).join(", ")}`;
    }

    if (timeReferences.length > 0) {
        const timeCol = semanticLayer.primaryTimeDimension || semanticLayer.availableTimeColumns?.[0];
        if (!timeCol) return null;
        selectDims += `date_trunc(
    'month',
    STRPTIME(
        "${timeCol}",
        '%m/%d/%Y'
    )
) AS month, `;
        groupBy += groupBy ? `, month` : `GROUP BY month`;
    }

    // ── 4. Intent-specific SQL assembly ───────────────────────────────────────

    // SUMMARY — single aggregate, no grouping
    if (intent === "SUMMARY" && dimensions.length === 0 && timeReferences.length === 0) {
        return `SELECT ${metricFormula} AS "${metric.name}" FROM data_table ${whereClause}`.trim();
    }

    // SUMMARY with dimensions — treat as BREAKDOWN (e.g. "suppliers where Winning")
    const effectiveIntent = (intent === "SUMMARY" && dimensions.length > 0) ? "BREAKDOWN" : intent;

    // RANKING — top / bottom N per dimension
    if (effectiveIntent === "RANKING" && dimensions.length > 0) {
        return `SELECT ${selectDims}${metricFormula} AS "${metric.name}" FROM data_table ${whereClause} ${groupBy} ORDER BY "${metric.name}" ${sortDir} NULLS LAST LIMIT 10`
            .replace(/\s+/g, " ").trim();
    }

    // BREAKDOWN — all groups, no limit
    if (effectiveIntent === "BREAKDOWN" && dimensions.length > 0) {
        return `SELECT ${selectDims}${metricFormula} AS "${metric.name}" FROM data_table ${whereClause} ${groupBy} ORDER BY "${metric.name}" ${sortDir} NULLS LAST`
            .replace(/\s+/g, " ").trim();
    }

    // COMPARISON — compare entities side-by-side
    if (effectiveIntent === "COMPARISON" && dimensions.length > 0) {
        return `SELECT ${selectDims}${metricFormula} AS "${metric.name}" FROM data_table ${whereClause} ${groupBy} ORDER BY "${metric.name}" ${sortDir} NULLS LAST LIMIT 20`
            .replace(/\s+/g, " ").trim();
    }

    return null;
}
