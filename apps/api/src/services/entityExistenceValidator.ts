import { QuestionFilter } from "../ai/questionTypes.js";
import { DatasetMetadata } from "./metadataService.js";
import { normalizeCompetitorName } from "./competitorDetector.js";

export interface EntityExistenceResult {
    valid: boolean;
    missingEntity?: string;
    message?: string;
}

function normalize(s: string): string {
    return normalizeCompetitorName(s);
}

function allKnownValues(metadata: DatasetMetadata): string[] {
    return [
        ...metadata.destinations,
        ...metadata.suppliers,
        ...(metadata.thirdParties ?? []),
        ...metadata.chains,
        ...metadata.hotels,
        ...metadata.countries,
        ...metadata.apwBuckets
    ];
}

function entityExistsInMetadata(name: string, metadata: DatasetMetadata): boolean {
    const norm = normalize(name);
    const known = allKnownValues(metadata);

    return known.some(v => {
        const vNorm = normalize(v);
        return vNorm === norm || vNorm.includes(norm) || norm.includes(vNorm);
    });
}

/**
 * Validates that named entities referenced in filters actually exist in the dataset.
 * Prevents hallucinated recommendations for unknown entities like "HotelBeds".
 */
export function shouldValidateEntityExistence(question: string): boolean {
    const q = question.toLowerCase();
    return (
        /what should we do about\b/.test(q) ||
        /\babout [a-z0-9]/i.test(question) ||
        /recommendations? for\b/.test(q) ||
        /what should we do for\b/.test(q)
    );
}

export function validateEntityExistence(
    filters: QuestionFilter[],
    metadata: DatasetMetadata
): EntityExistenceResult {
    const entityFilters = filters.filter(
        f => f.dimension === "_entity" ||
            f.dimension === "hotel" ||
            f.dimension === "supplier" ||
            f.dimension === "thirdparty" ||
            f.dimension === "destination" ||
            f.dimension === "chain"
    );

    for (const filter of entityFilters) {
        const name = String(filter.value);

        if (filter.dimension === "destination" && metadata.destinations.some(d => normalize(d) === normalize(name))) continue;
        if (filter.dimension === "supplier" && metadata.suppliers.some(s => normalize(s) === normalize(name))) continue;
        if (filter.dimension === "thirdparty" && (metadata.thirdParties ?? []).some(t => normalize(t) === normalize(name))) continue;
        if (filter.dimension === "chain" && metadata.chains.some(c => normalize(c) === normalize(name))) continue;
        if (filter.dimension === "hotel" && metadata.hotels.some(h => normalize(h) === normalize(name))) continue;

        if (!entityExistsInMetadata(name, metadata)) {
            console.warn(`[ENTITY_VALIDATION] Entity not found in dataset: "${name}"`);
            return {
                valid: false,
                missingEntity: name,
                message: `Entity "${name}" was not found in this dataset. Please verify the name or choose an entity that exists in your data.`
            };
        }
    }

    return { valid: true };
}
