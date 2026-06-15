import { redis } from "../lib/redis.js";

// TTL of 7 days for SQL cache since schemas rarely change
const CACHE_TTL = 60 * 60 * 24 * 7; 

export async function getCachedSql(datasetType: string, normalizedQuestion: string): Promise<string | null> {
    const key = `sql_cache:${datasetType}:${normalizedQuestion}`;
    try {
        const cached = await redis.get<string>(key);
        if (cached) {
            console.log(`[QueryCache] HIT: ${key}`);
            return cached;
        }
        console.log(`[QueryCache] MISS: ${key}`);
        return null;
    } catch (error) {
        console.error("[QueryCache] Error reading from cache:", error);
        return null;
    }
}

export async function setCachedSql(datasetType: string, normalizedQuestion: string, sql: string): Promise<void> {
    const key = `sql_cache:${datasetType}:${normalizedQuestion}`;
    try {
        await redis.setex(key, CACHE_TTL, sql);
    } catch (error) {
        console.error("[QueryCache] Error writing to cache:", error);
    }
}
