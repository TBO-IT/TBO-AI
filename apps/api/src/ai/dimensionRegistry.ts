/**
 * Dimension Registry
 *
 * Single source of truth for every business dimension in the platform.
 * Maps canonical dimension keys → physical schema columns + valid values.
 *
 * All components (Analyzer, Validator, Router, Template Engine) must reference
 * this registry instead of hard-coding column names or bucket values.
 */
export interface DimensionDefinition {
    /** Canonical key used internally everywhere (e.g. "apw") */
    canonicalKey: string;

    /** Human-readable label for error messages */
    label: string;

    /** Physical column name(s) in the CSV. First match wins. */
    physicalColumns: string[];

    /**
     * Optional allowlist of valid filter values.
     * If set, the validator rejects any value not in this list.
     * If empty, any value is accepted (open-ended like city names).
     */
    validValues?: string[];

    /**
     * Whether filters against this dimension use exact-match (=)
     * or fuzzy-match (ILIKE). Default: exact for known values, ILIKE for open-ended.
     */
    filterType: "exact" | "ilike";
}

export const DIMENSION_REGISTRY: Record<string, DimensionDefinition> = {

    destination: {
        canonicalKey: "destination",
        label: "Destination",
        physicalColumns: ["destination"],
        filterType: "ilike"
    },

    supplier: {
        canonicalKey: "supplier",
        label: "Supplier",
        physicalColumns: ["suppliername", "supplier"],
        filterType: "ilike"
    },

    hotel: {
        canonicalKey: "hotel",
        label: "Hotel",
        physicalColumns: ["tbo_hotelname", "hotel name", "Hotel name"],
        filterType: "ilike"
    },

    chain: {
        canonicalKey: "chain",
        label: "Hotel Chain",
        physicalColumns: ["tbo_chainname", "chain", "chainname"],
        filterType: "ilike"
    },

    city: {
        canonicalKey: "city",
        label: "City",
        physicalColumns: ["city", "City"],
        filterType: "ilike"
    },

    country: {
        canonicalKey: "country",
        label: "Country",
        physicalColumns: ["country", "Country"],
        filterType: "ilike"
    },

    hotel_id: {
        canonicalKey: "hotel_id",
        label: "Hotel ID",
        physicalColumns: ["hotel_id", "Hotel Id"],
        filterType: "exact"
    },

    apw: {
        canonicalKey: "apw",
        label: "Advanced Purchase Window",
        physicalColumns: ["apw_bucket", "apw_bucket_new"],
        validValues: [
            "< 10 days",
            "11-30 days",
            "31-45 days",
            "46-60 days",
            "61-90 days",
            "90+ days",
            "Other"
        ],
        filterType: "exact"
    },

    competitive_status: {
        canonicalKey: "competitive_status",
        label: "Competitive Status",
        physicalColumns: ["Competitive Status", "competitive_status"],
        validValues: ["Winning", "Losing", "Equal"],
        filterType: "exact"
    }
};

/**
 * Resolves the canonical key to the first matching physical column
 * found in the actual schema columns list.
 */
export function resolvePhysicalColumn(
    canonicalKey: string,
    schemaColumns: string[]
): string | null {
    const def = DIMENSION_REGISTRY[canonicalKey];
    if (!def) return null;

    const schemaLower = schemaColumns.map(c => c.toLowerCase());

    for (const physCol of def.physicalColumns) {
        const idx = schemaLower.indexOf(physCol.toLowerCase());
        if (idx !== -1) return schemaColumns[idx]; // Return original casing
    }

    return null;
}

/**
 * Checks whether a filter value is valid for the given dimension.
 * Returns true if no validValues list is defined (open-ended dimension).
 */
export function isValidFilterValue(canonicalKey: string, value: string): boolean {
    const def = DIMENSION_REGISTRY[canonicalKey];
    if (!def || !def.validValues || def.validValues.length === 0) return true;
    return def.validValues.some(v => v.toLowerCase() === value.toLowerCase());
}

/**
 * Returns the DimensionDefinition for a canonical key, or null if not found.
 */
export function getDimension(canonicalKey: string): DimensionDefinition | null {
    return DIMENSION_REGISTRY[canonicalKey] ?? null;
}
