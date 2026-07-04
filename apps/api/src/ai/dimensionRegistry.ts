import { getDimensionMapping, resolvePhysicalColumn as executionResolvePhysicalColumn } from "./execution/ExecutionRegistry.js";

/**
 * Dimension Registry
 *
 * Single source of truth for every business dimension in the platform.
 * Maps canonical dimension keys → valid values.
 * Physical schema mapping has been moved to ExecutionRegistry.
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

// Temporary internal structure for valid values and labels
const DIMENSION_BUSINESS_PROPS: Record<string, { label: string, validValues?: string[] }> = {
    destination: { label: "Destination" },
    supplier: { label: "Supplier" },
    hotel: { label: "Hotel" },
    chain: { label: "Hotel Chain" },
    city: { label: "City" },
    country: { label: "Country" },
    hotel_id: { label: "Hotel ID" },
    apw: {
        label: "Advanced Purchase Window",
        validValues: ["< 10 days", "11-30 days", "31-45 days", "46-60 days", "61-90 days", "90+ days", "Other"]
    },
    competitive_status: {
        label: "Competitive Status",
        validValues: ["Winning", "Losing", "Equal"]
    },
    thirdparty: { label: "Competitor" },
    fuzzy_score: { label: "Fuzzy Score" }
};

/**
 * Builds the backward-compatible dimension registry by merging business 
 * props with execution props.
 */
function buildLegacyDimensionRegistry(): Record<string, DimensionDefinition> {
    const registry: Record<string, DimensionDefinition> = {};
    for (const [key, props] of Object.entries(DIMENSION_BUSINESS_PROPS)) {
        const mapping = getDimensionMapping(key);
        if (mapping) {
            registry[key] = {
                canonicalKey: key,
                label: props.label,
                validValues: props.validValues,
                physicalColumns: mapping.physicalColumns,
                filterType: mapping.filterType
            };
        }
    }
    return registry;
}

export const DIMENSION_REGISTRY = buildLegacyDimensionRegistry();

/**
 * Resolves the canonical key to the first matching physical column
 * found in the actual schema columns list.
 */
export function resolvePhysicalColumn(
    canonicalKey: string,
    schemaColumns: string[]
): string | null {
    return executionResolvePhysicalColumn(canonicalKey, schemaColumns);
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
