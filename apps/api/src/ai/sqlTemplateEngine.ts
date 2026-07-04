import { QuestionAnalysis, QuestionFilter } from "./questionTypes.js";
import { EnrichedSemanticLayer } from "./semanticLayer.js";
import { buildWhereClause, buildFilterCondition } from "./filterBuilder.js";
import { detectSortDirection as polaritySortDirection } from "./queryPolarity.js";
import { logger } from "../lib/logger.js";

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
 * Maps a canonical focus keyword (hotel, supplier, chain, destination)
 * to physical columns that should be selected for row-level queries.
 */
function getSelectColumnsForFocus(
    focus: string | null | undefined,
    datasetType: string,
    schemaColumns: string[]
): string[] {
    const columns: string[] = [];
    const schemaLower = schemaColumns.map(c => c.toLowerCase());

    const resolveCol = (name: string) => {
        const idx = schemaLower.indexOf(name.toLowerCase());
        return idx !== -1 ? schemaColumns[idx] : null;
    };

    if (datasetType === "COMPETITIVENESS") {
        const hotelCol = resolveCol("tbo_hotelname") || resolveCol("hotel name") || resolveCol("thirdparty_hotelname");
        const supplierCol = resolveCol("suppliername") || resolveCol("supplier");
        const chainCol = resolveCol("tbo_chainname") || resolveCol("chain");
        const destCol = resolveCol("destination") || resolveCol("city");
        const statusCol = resolveCol("Competitive Status") || resolveCol("competitive_status");
        const priceDiffCol = resolveCol("price_diff_perc");
        const tboPriceCol = resolveCol("tbo_price");
        const competitorPriceCol = resolveCol("thirdparty_price");

        if (focus === "hotel") {
            if (hotelCol) columns.push(hotelCol);
            if (destCol) columns.push(destCol);
            if (priceDiffCol) columns.push(priceDiffCol);
            if (statusCol) columns.push(statusCol);
            if (tboPriceCol) columns.push(tboPriceCol);
            if (competitorPriceCol) columns.push(competitorPriceCol);
        } else if (focus === "supplier") {
            if (supplierCol) columns.push(supplierCol);
            if (destCol) columns.push(destCol);
            if (priceDiffCol) columns.push(priceDiffCol);
            if (statusCol) columns.push(statusCol);
        } else if (focus === "chain") {
            if (chainCol) columns.push(chainCol);
            if (destCol) columns.push(destCol);
            if (priceDiffCol) columns.push(priceDiffCol);
            if (statusCol) columns.push(statusCol);
        } else if (focus === "destination") {
            if (destCol) columns.push(destCol);
            if (priceDiffCol) columns.push(priceDiffCol);
            if (statusCol) columns.push(statusCol);
        } else {
            // Default select checklist
            if (hotelCol) columns.push(hotelCol);
            if (destCol) columns.push(destCol);
            if (priceDiffCol) columns.push(priceDiffCol);
            if (statusCol) columns.push(statusCol);
        }
    } else if (datasetType === "CONVERSION") {
        const hotelCol = resolveCol("Hotel name") || resolveCol("hotel_name");
        const cityCol = resolveCol("City") || resolveCol("city");
        const searchesCol = resolveCol("Searches");
        const bookingsCol = resolveCol("Bookings");
        const l2bCol = resolveCol("L2B%");

        if (focus === "hotel") {
            if (hotelCol) columns.push(hotelCol);
            if (cityCol) columns.push(cityCol);
            if (searchesCol) columns.push(searchesCol);
            if (bookingsCol) columns.push(bookingsCol);
            if (l2bCol) columns.push(l2bCol);
        } else if (focus === "destination") {
            if (cityCol) columns.push(cityCol);
            if (searchesCol) columns.push(searchesCol);
            if (bookingsCol) columns.push(bookingsCol);
            if (l2bCol) columns.push(l2bCol);
        } else {
            if (hotelCol) columns.push(hotelCol);
            if (cityCol) columns.push(cityCol);
            if (searchesCol) columns.push(searchesCol);
            if (bookingsCol) columns.push(bookingsCol);
            if (l2bCol) columns.push(l2bCol);
        }
    }

    return columns;
}

/**
 * Extracts limit and sort direction dynamically from ranking/list keywords.
 */
function getLimitAndDirection(
    question: string,
    defaultLimit: number = 10
): { limit: number | null; direction: "ASC" | "DESC" } {
    const q = question.toLowerCase();

    let limit: number | null = null;
    const limitMatch = /\b(limit|top|bottom|best|worst|first|last)\s+(\d+)\b/i.exec(q);
    if (limitMatch) {
        limit = Number(limitMatch[2]);
    } else {
        const numberMatch = /\b(\d+)\b/.exec(q);
        if (numberMatch && /\b(top|bottom|best|worst|limit)\b/.test(q)) {
            limit = Number(numberMatch[1]);
        }
    }

    if (!limit && /\b(top|bottom|best|worst|highest|lowest|limit)\b/.test(q)) {
        limit = defaultLimit;
    }

    let direction: "ASC" | "DESC" = "DESC";

    if (/\b(bottom|worst|lowest)\b/.test(q)) {
        direction = "ASC";
    } else if (/\b(top|best|highest)\b/.test(q)) {
        direction = "DESC";
    } else {
        direction = detectSortDirection(question);
    }

    return { limit, direction };
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
            logger.info({ primaryMetricKey }, "Template engine inferred primary metric");
        } else {
            return null;
        }
    }

    if (metrics.length === 0) return null;

    // Resolve all requested metrics
    const resolvedMetrics = metrics.map(metricKey => {
        return semanticLayer.metrics.find(m =>
            m.name.toLowerCase().replace(/\s+/g, "_") === metricKey ||
            m.name.toLowerCase().includes(metricKey.replace(/_/g, " "))
        );
    }).filter(Boolean) as typeof semanticLayer.metrics;

    if (resolvedMetrics.length === 0) {
        logger.warn({ metrics }, "Template engine metrics not found in semantic layer");
        return null;
    }

    const primaryMetric = resolvedMetrics[0];
    const metricSelects = resolvedMetrics.map(m => `${m.formula} AS "${m.name}"`).join(", ");
    
    const sortDir = detectSortDirection(analysis.originalQuestion);
    const schemaColumns = semanticLayer.allColumns.map(c => c.column_name);

    // ── 2. WHERE clause from structured filters ───────────────────────────────
    const typedWhere = buildWhereClause(filters, schemaColumns);

    let whereClause = "";
    if (typedWhere) {
        whereClause = typedWhere;
    }

    // Log filter propagation
    if (filters.length > 0) {
        logger.info({ whereClause: whereClause || "(none resolved)" }, "Template engine SQL filters");
    }

    // ── 3. SELECT / GROUP BY (dimensions + optional time bucketing) ───────────
    let selectDims = "";
    let groupBy = "";

    if (dimensions.length > 0) {
        const dimCols = dimensions.map(d => getPhysicalColumnName(d, semanticLayer));
        logger.info({ dimensions, dimCols }, "Template engine dimension columns");
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

    // LIST — row-level query
    if (intent === "LIST") {
        const selectCols = getSelectColumnsForFocus(analysis.focus, semanticLayer.datasetType, schemaColumns);
        if (selectCols.length === 0) return null;
        
        const selectClause = selectCols.map(c => `"${c}"`).join(", ");
        const { limit, direction } = getLimitAndDirection(analysis.originalQuestion, 10);
        
        let orderByClause = "";
        const metricCol = getPhysicalColumnName(primaryMetric.name.toLowerCase().replace(/\s+/g, "_"), semanticLayer);
        if (metricCol && schemaColumns.includes(metricCol)) {
            orderByClause = `ORDER BY "${metricCol}" ${direction} NULLS LAST`;
        }
        
        const limitClause = limit ? `LIMIT ${limit}` : "";
        
        return `SELECT ${selectClause} FROM data_table ${whereClause} ${orderByClause} ${limitClause}`
            .replace(/\s+/g, " ").trim();
    }

    // SUMMARY — single aggregate, no grouping
    if (intent === "SUMMARY" && dimensions.length === 0 && timeReferences.length === 0) {
        return `SELECT ${metricSelects} FROM data_table ${whereClause}`.trim();
    }

    // SUMMARY with dimensions — treat as BREAKDOWN (e.g. "suppliers where Winning")
    const effectiveIntent = (intent === "SUMMARY" && dimensions.length > 0) ? "BREAKDOWN" : intent;

    // RANKING — top / bottom N per dimension
    if (effectiveIntent === "RANKING" && dimensions.length > 0) {
        const { limit, direction } = getLimitAndDirection(analysis.originalQuestion, 10);
        const limitStr = limit ? `LIMIT ${limit}` : "";
        return `SELECT ${selectDims}${metricSelects} FROM data_table ${whereClause} ${groupBy} ORDER BY "${primaryMetric.name}" ${direction} NULLS LAST ${limitStr}`
            .replace(/\s+/g, " ").trim();
    }

    // BREAKDOWN — all groups, no limit
    if (effectiveIntent === "BREAKDOWN" && dimensions.length > 0) {
        const { direction } = getLimitAndDirection(analysis.originalQuestion, 10);
        return `SELECT ${selectDims}${metricSelects} FROM data_table ${whereClause} ${groupBy} ORDER BY "${primaryMetric.name}" ${direction} NULLS LAST`
            .replace(/\s+/g, " ").trim();
    }

    // COMPARISON — compare entities side-by-side
    if (effectiveIntent === "COMPARISON" && dimensions.length > 0) {
        const { limit, direction } = getLimitAndDirection(analysis.originalQuestion, 20);
        const limitStr = limit ? `LIMIT ${limit}` : "";
        return `SELECT ${selectDims}${metricSelects} FROM data_table ${whereClause} ${groupBy} ORDER BY "${primaryMetric.name}" ${direction} NULLS LAST ${limitStr}`
            .replace(/\s+/g, " ").trim();
    }

    return null;
}
