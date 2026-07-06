import { Index } from "@upstash/vector";
import type { ResponseSource } from "./chatOrchestrator.js";

// Ensure environment variables are loaded for @upstash/vector (UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN)
const index = new Index();

export interface SemanticCacheEntry extends Record<string, unknown> {
    narrative: string;
    responseSource: ResponseSource;
    sql: string;
    executivePack?: any;
    rootCausePack?: any;
    queryResults?: any;
}

export async function getSemanticCachedNarrative(
    datasetId: string,
    question: string
): Promise<SemanticCacheEntry | null> {
    try {
        const results = await index.query<SemanticCacheEntry>({
            data: question,
            topK: 1,
            includeMetadata: true,
            filter: `datasetId = '${datasetId}'`,
        });

        if (results && results.length > 0) {
            const match = results[0];
            // Check for high similarity (score > 0.90)
            if (match.score > 0.90 && match.metadata) {
                console.log(`[SEMANTIC_CACHE] HIT | score=${match.score.toFixed(4)} | question="${question}"`);
                return match.metadata;
            } else {
                console.log(`[SEMANTIC_CACHE] MISS (low score) | highest_score=${match.score.toFixed(4)}`);
            }
        } else {
            console.log(`[SEMANTIC_CACHE] MISS | No results found`);
        }
    } catch (error: any) {
        console.error(`[SEMANTIC_CACHE] Error during query: ${error.message}`);
    }
    return null;
}

export async function setSemanticCachedNarrative(
    datasetId: string,
    question: string,
    entry: SemanticCacheEntry
): Promise<void> {
    try {
        await index.upsert({
            id: `${datasetId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            data: question,
            metadata: {
                ...entry,
                datasetId,
            }
        });
        console.log(`[SEMANTIC_CACHE] SET | question="${question}"`);
    } catch (error: any) {
        console.error(`[SEMANTIC_CACHE] Error during upsert: ${error.message}`);
    }
}
