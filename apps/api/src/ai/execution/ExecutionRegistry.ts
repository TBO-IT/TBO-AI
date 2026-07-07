import { MetricId, ConceptId } from "../ontology/types.js";

/**
 * Execution Registry
 *
 * This layer bridges the Business Ontology (which defines what metrics and dimensions MEAN)
 * with DuckDB (which requires precise SQL strings and physical column mappings to EXECUTE).
 *
 * It is purely an infrastructure translation layer.
 */

// ─── SQL Formulas for Metrics ──────────────────────────────────────────────────
// These were previously in metricRegistry.ts mixed with business definitions.

export const METRIC_SQL_FORMULAS: Record<string, string> = {
    // Competitiveness
    win_rate: 'AVG(CASE WHEN "Competitive Status" = \'Winning\' THEN 1.0 ELSE 0.0 END) * 100.0',
    avg_price_diff: "AVG(CAST(price_diff_perc AS DOUBLE))",
    median_price_diff: "MEDIAN(CAST(price_diff_perc AS DOUBLE))",
    
    // Conversion & Volume
    searches: "SUM(TRY_CAST(REPLACE(CAST(Searches AS VARCHAR), ',', '') AS BIGINT))",
    bookings: "SUM(TRY_CAST(REPLACE(CAST(Bookings AS VARCHAR), ',', '') AS BIGINT))",
    vouchered_bookings: 'SUM(TRY_CAST(REPLACE(CAST("Vouchered Bookings" AS VARCHAR), \',\', \'\') AS BIGINT))',
    cancelled_bookings: 'SUM(TRY_CAST(REPLACE(CAST("Cancelled  Bookings" AS VARCHAR), \',\', \'\') AS BIGINT))',
    
    // Revenue
    total_sales: 'SUM(TRY_CAST(REPLACE(CAST("Total Sales" AS VARCHAR), \',\', \'\') AS DOUBLE))',
    vouchered_sales: 'SUM(TRY_CAST(REPLACE(CAST("Vouchered Sales" AS VARCHAR), \',\', \'\') AS DOUBLE))',
    cancel_sales: 'SUM(TRY_CAST(REPLACE(CAST("Cancel Sales" AS VARCHAR), \',\', \'\') AS DOUBLE))',
    
    // Derived
    l2b: '(SUM(TRY_CAST(REPLACE(CAST(Bookings AS VARCHAR), \',\', \'\') AS DOUBLE)) / NULLIF(SUM(TRY_CAST(REPLACE(CAST(Searches AS VARCHAR), \',\', \'\') AS DOUBLE)), 0.0)) * 100.0',
    l2v: '(SUM(TRY_CAST(REPLACE(CAST("Vouchered Bookings" AS VARCHAR), \',\', \'\') AS DOUBLE)) / NULLIF(SUM(TRY_CAST(REPLACE(CAST(Searches AS VARCHAR), \',\', \'\') AS DOUBLE)), 0.0)) * 100.0'
};

/**
 * Gets the DuckDB SQL formula for a given metric key.
 */
export function getMetricSqlFormula(metricKey: string): string | undefined {
    return METRIC_SQL_FORMULAS[metricKey];
}

// ─── Physical Schema Mapping for Dimensions ───────────────────────────────────
// These were previously in dimensionRegistry.ts.

export interface PhysicalDimensionMapping {
    canonicalKey: string;
    physicalColumns: string[];
    filterType: "exact" | "ilike";
}

export const DIMENSION_PHYSICAL_MAPPINGS: Record<string, PhysicalDimensionMapping> = {
    destination: {
        canonicalKey: "destination",
        physicalColumns: ["destination"],
        filterType: "ilike"
    },
    supplier: {
        canonicalKey: "supplier",
        physicalColumns: ["suppliername", "supplier"],
        filterType: "ilike"
    },
    hotel: {
        canonicalKey: "hotel",
        physicalColumns: ["tbo_hotelname", "hotel name", "Hotel name"],
        filterType: "ilike"
    },
    chain: {
        canonicalKey: "chain",
        physicalColumns: ["tbo_chainname", "chain", "chainname"],
        filterType: "ilike"
    },
    city: {
        canonicalKey: "city",
        physicalColumns: ["city", "City"],
        filterType: "ilike"
    },
    country: {
        canonicalKey: "country",
        physicalColumns: ["country", "Country"],
        filterType: "ilike"
    },
    hotel_id: {
        canonicalKey: "hotel_id",
        physicalColumns: ["hotel_id", "Hotel Id"],
        filterType: "exact"
    },
    apw: {
        canonicalKey: "apw",
        physicalColumns: ["apw_bucket", "apw_bucket_new"],
        filterType: "exact"
    },
    competitive_status: {
        canonicalKey: "competitive_status",
        physicalColumns: ["Competitive Status", "competitive_status"],
        filterType: "exact"
    },
    thirdparty: {
        canonicalKey: "thirdparty",
        physicalColumns: ["thirdparty", "third_party", "competitor"],
        filterType: "exact"
    },
    fuzzy_score: {
        canonicalKey: "fuzzy_score",
        physicalColumns: ["fuzzy_score", "Fuzzy Score", "fuzzy score"],
        filterType: "exact"
    },
    contracting_manager: {
        canonicalKey: "contracting_manager",
        physicalColumns: ["contracting_manager"],
        filterType: "ilike"
    }
};

/**
 * Resolves the canonical key to the first matching physical column
 * found in the actual schema columns list.
 */
const METRIC_PHYSICAL_COLUMNS: Record<string, string> = {
    avg_price_diff: "price_diff_perc",
    median_price_diff: "price_diff_perc",
    searches: "Searches",
    bookings: "Bookings",
    vouchered_bookings: "Vouchered Bookings",
    cancelled_bookings: "Cancelled  Bookings",
    total_sales: "Total Sales",
    vouchered_sales: "Vouchered Sales",
    cancel_sales: "Cancel Sales",
    l2b: "L2B%",
    l2v: "L2V%"
};

/**
 * Resolves the canonical key to the first matching physical column
 * found in the actual schema columns list.
 */
export function resolvePhysicalColumn(
    canonicalKey: string,
    schemaColumns: string[]
): string | null {
    const schemaLower = schemaColumns.map(c => c.toLowerCase());

    // 1. Try metric mapping first
    const metricPhysCol = METRIC_PHYSICAL_COLUMNS[canonicalKey];
    if (metricPhysCol) {
        const idx = schemaLower.indexOf(metricPhysCol.toLowerCase());
        if (idx !== -1) return schemaColumns[idx];
    }

    // 2. Fallback to dimension mapping
    const def = DIMENSION_PHYSICAL_MAPPINGS[canonicalKey];
    if (!def) return null;

    for (const physCol of def.physicalColumns) {
        const idx = schemaLower.indexOf(physCol.toLowerCase());
        if (idx !== -1) return schemaColumns[idx]; // Return original casing
    }

    return null;
}

export function getDimensionMapping(canonicalKey: string): PhysicalDimensionMapping | null {
    return DIMENSION_PHYSICAL_MAPPINGS[canonicalKey] ?? null;
}
