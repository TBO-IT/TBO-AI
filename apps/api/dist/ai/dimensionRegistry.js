export const DIMENSION_REGISTRY = {
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
    },
    thirdparty: {
        canonicalKey: "thirdparty",
        label: "Competitor",
        physicalColumns: ["thirdparty", "third_party", "competitor"],
        filterType: "exact"
    }
};
/**
 * Resolves the canonical key to the first matching physical column
 * found in the actual schema columns list.
 */
export function resolvePhysicalColumn(canonicalKey, schemaColumns) {
    const def = DIMENSION_REGISTRY[canonicalKey];
    if (!def)
        return null;
    const schemaLower = schemaColumns.map(c => c.toLowerCase());
    for (const physCol of def.physicalColumns) {
        const idx = schemaLower.indexOf(physCol.toLowerCase());
        if (idx !== -1)
            return schemaColumns[idx]; // Return original casing
    }
    return null;
}
/**
 * Checks whether a filter value is valid for the given dimension.
 * Returns true if no validValues list is defined (open-ended dimension).
 */
export function isValidFilterValue(canonicalKey, value) {
    const def = DIMENSION_REGISTRY[canonicalKey];
    if (!def || !def.validValues || def.validValues.length === 0)
        return true;
    return def.validValues.some(v => v.toLowerCase() === value.toLowerCase());
}
/**
 * Returns the DimensionDefinition for a canonical key, or null if not found.
 */
export function getDimension(canonicalKey) {
    return DIMENSION_REGISTRY[canonicalKey] ?? null;
}
