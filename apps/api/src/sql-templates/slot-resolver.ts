import { DatasetMetadata } from "../services/metadataService.js";

// Basic Levenshtein distance for fuzzy matching
function levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + indicator
            );
        }
    }
    return matrix[b.length][a.length];
}

// Normalized similarity score between 0 and 1
function similarity(a: string, b: string): number {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    if (aLower === bLower) return 1.0;
    
    // Check for substring match (e.g. "marriott" in "Marriott Hotels")
    if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.9;
    
    const distance = levenshtein(aLower, bLower);
    const maxLength = Math.max(a.length, b.length);
    return 1 - (distance / maxLength);
}

const CONFIDENCE_THRESHOLD = 0.85;

export class SlotResolver {
    private metadata: DatasetMetadata | null = null;
    
    updateMetadata(metadata: DatasetMetadata) {
        this.metadata = metadata;
    }

    private resolveEntity(rawName: string, entityList: string[]): { resolved: string | null, confidence: number } {
        if (!entityList || entityList.length === 0) return { resolved: rawName, confidence: 1.0 }; // Assume valid if no list

        let bestMatch: string | null = null;
        let highestScore = 0;

        for (const entity of entityList) {
            if (!entity) continue;
            const score = similarity(rawName, String(entity));
            if (score > highestScore) {
                highestScore = score;
                bestMatch = String(entity);
            }
        }

        if (highestScore >= CONFIDENCE_THRESHOLD) {
            return { resolved: bestMatch, confidence: highestScore };
        }
        
        return { resolved: null, confidence: highestScore };
    }

    resolveSlot(slotKey: string, rawValue: string): { resolved: string | null, confidence: number } {
        // Simple passthrough for exact categorical slots or dates
        if (slotKey === "apw_bucket_new" || slotKey === "competitive_status" || slotKey.includes("date") || slotKey === "metric" || slotKey === "limit") {
            return { resolved: rawValue, confidence: 1.0 };
        }

        if (!this.metadata) {
            // Cannot validate without metadata, accept raw but warn
            return { resolved: rawValue, confidence: 1.0 };
        }

        // Map slot keys to metadata lists
        let listToSearch: string[] = [];
        if (slotKey === "destination") listToSearch = this.metadata.destinations || [];
        else if (slotKey === "chain") listToSearch = this.metadata.chains || [];
        else if (slotKey === "thirdparty") listToSearch = this.metadata.thirdParties || [];
        else if (slotKey === "hotel") listToSearch = this.metadata.hotels || [];

        if (listToSearch.length === 0) {
            return { resolved: rawValue, confidence: 1.0 };
        }

        return this.resolveEntity(rawValue, listToSearch);
    }

    resolveAll(rawSlots: Record<string, string>): { resolvedSlots: Record<string, any> | null, lowestConfidence: number, failedSlot?: string } {
        const resolvedSlots: Record<string, any> = {};
        let lowestConfidence = 1.0;

        for (const [key, value] of Object.entries(rawSlots)) {
            const { resolved, confidence } = this.resolveSlot(key, value);
            
            if (resolved === null) {
                return { resolvedSlots: null, lowestConfidence: confidence, failedSlot: key };
            }
            
            resolvedSlots[key] = resolved;
            if (confidence < lowestConfidence) {
                lowestConfidence = confidence;
            }
        }

        return { resolvedSlots, lowestConfidence };
    }
}

export const globalSlotResolver = new SlotResolver();
