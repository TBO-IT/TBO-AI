import { DatasetMetadata } from "../services/metadataService.js";
import { QuestionFilter } from "./questionTypes.js";

// ─── Canonical dimension names ────────────────────────────────────────────────
//
// Physical column names (suppliername, tbo_chainname, etc.) must NEVER leak
// into QuestionFilter.dimension. All filters must use canonical keys so that
// every downstream component (FilterBuilder, ComparisonEngine, etc.) can work
// with a single consistent vocabulary.
//
// Physical column → Canonical key
// ──────────────────────────────────
// suppliername      → supplier
// tbo_hotelname     → hotel
// tbo_chainname     → chain
// destination       → destination  (already canonical)
// country           → country      (already canonical)
// apw_bucket_new    → apw

/**
 * Resolves entity mentions in the question text against known dataset values.
 *
 * Rules:
 *  1. All QuestionFilter.dimension values are canonical (never physical columns).
 *  2. Each entity group is iterated independently — NOT nested — to avoid
 *     Cartesian-product duplication.
 *  3. Filters are deduplicated before returning.
 *
 * @param question  The raw user question string.
 * @param metadata  Dataset metadata with distinct values per dimension.
 */
export function resolveEntities(
    question: string,
    metadata: DatasetMetadata
): QuestionFilter[] {
    const rawFilters: QuestionFilter[] = [];
    const lower = question.toLowerCase();

    // ── Destinations ─────────────────────────────────────────────────────────
    for (const destination of metadata.destinations) {
        if (lower.includes(destination.toLowerCase())) {
            rawFilters.push({
                dimension: "destination",    // canonical
                operator: "=",
                value: destination
            });
        }
    }

    // ── Third-party competitors ───────────────────────────────────────────────
    for (const thirdParty of metadata.thirdParties ?? []) {
        if (lower.includes(thirdParty.toLowerCase())) {
            rawFilters.push({
                dimension: "thirdparty",
                operator: "=",
                value: thirdParty
            });
        }
    }

    // ── Suppliers ─────────────────────────────────────────────────────────────
    // NOTE: iterated INDEPENDENTLY, not inside the destination loop.
    for (const supplier of metadata.suppliers) {
        if (lower.includes(supplier.toLowerCase())) {
            rawFilters.push({
                dimension: "supplier",       // canonical (not "suppliername")
                operator: "=",
                value: supplier
            });
        }
    }

    // ── Hotel Chains ──────────────────────────────────────────────────────────
    for (const chain of metadata.chains) {
        if (lower.includes(chain.toLowerCase())) {
            rawFilters.push({
                dimension: "chain",          // canonical (not "tbo_chainname")
                operator: "=",
                value: chain
            });
        }
    }

    // ── Hotels ────────────────────────────────────────────────────────────────
    for (const hotel of metadata.hotels) {
        if (lower.includes(hotel.toLowerCase())) {
            rawFilters.push({
                dimension: "hotel",          // canonical (not "tbo_hotelname")
                operator: "=",
                value: hotel
            });
        }
    }

    // ── Countries ─────────────────────────────────────────────────────────────
    for (const country of metadata.countries) {
        if (lower.includes(country.toLowerCase())) {
            rawFilters.push({
                dimension: "country",        // canonical
                operator: "=",
                value: country
            });
        }
    }

    // ── APW Buckets ───────────────────────────────────────────────────────────
    for (const apwBucket of metadata.apwBuckets) {
        if (lower.includes(apwBucket.toLowerCase())) {
            rawFilters.push({
                dimension: "apw",            // canonical (not "apw_bucket_new")
                operator: "=",
                value: apwBucket
            });
        }
    }

    // ── Deduplicate ───────────────────────────────────────────────────────────
    const deduped = dedupeFilters(rawFilters);

    console.log(
        `[EntityResolver] Resolved ${deduped.length} unique filters ` +
        `(${rawFilters.length} raw) from question: "${question.slice(0, 60)}"`
    );

    return deduped;
}

// ─── Filter deduplication ─────────────────────────────────────────────────────

/**
 * Deduplicates a QuestionFilter array by (dimension + operator + value).
 * Preserves first-occurrence order.
 *
 * Input:
 *   [{dimension:"supplier",value:"Affiliate"}, {dimension:"supplier",value:"Synxis"},
 *    {dimension:"supplier",value:"Affiliate"}, {dimension:"supplier",value:"Synxis"}]
 *
 * Output:
 *   [{dimension:"supplier",value:"Affiliate"}, {dimension:"supplier",value:"Synxis"}]
 */
export function dedupeFilters(filters: QuestionFilter[]): QuestionFilter[] {
    const seen = new Set<string>();
    return filters.filter(f => {
        const key = `${f.dimension}|${f.operator}|${String(f.value).toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}