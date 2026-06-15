import { redis } from "../lib/redis.js";
import crypto from "crypto";

// TTL of 24 hours for narratives since underlying data might update 
// or we don't want to hold giant text strings forever
const CACHE_TTL = 60 * 60 * 24;

function generateHash(sql: string): string {
    return crypto.createHash("md5").update(sql).digest("hex");
}

export async function getCachedNarrative(datasetId: string, question: string, sql: string): Promise<string | null> {
    const hash = generateHash(sql);
    const key = `narrative_cache:${datasetId}:${question}:${hash}`;
    
    try {
        const cached = await redis.get<string>(key);
        if (cached) {
            console.log(`[NarrativeCache] HIT: ${key}`);
            return cached;
        }
        console.log(`[NarrativeCache] MISS: ${key}`);
        return null;
    } catch (error) {
        console.error("[NarrativeCache] Error reading from cache:", error);
        return null;
    }
}

export async function setCachedNarrative(datasetId: string, question: string, sql: string, narrative: string): Promise<void> {
    const hash = generateHash(sql);
    const key = `narrative_cache:${datasetId}:${question}:${hash}`;
    
    try {
        await redis.setex(key, CACHE_TTL, narrative);
    } catch (error) {
        console.error("[NarrativeCache] Error writing to cache:", error);
    }
}
