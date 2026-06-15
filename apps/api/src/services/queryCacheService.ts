import { redis } from "../lib/redis.js";
import crypto from "crypto";
import { METRIC_REGISTRY } from "../ai/metricRegistry.js";

// TTL of 7 days for SQL cache since schemas rarely change
const CACHE_TTL = 60 * 60 * 24 * 7;

// A short hash of all metric formulas. When metricRegistry.ts changes,
// this hash changes, automatically busting all stale SQL cache entries.
const METRIC_VERSION = crypto
    .createHash("md5")
    .update(JSON.stringify(Object.values(METRIC_REGISTRY).map(m => m.formula).sort()))
    .digest("hex")
    .slice(0, 8); 

export async function getCachedSql(datasetType: string, normalizedQuestion: string): Promise<string | null> {
    const key = `sql_cache:v${METRIC_VERSION}:${datasetType}:${normalizedQuestion}`;
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
    const key = `sql_cache:v${METRIC_VERSION}:${datasetType}:${normalizedQuestion}`;
    try {
        await redis.setex(key, CACHE_TTL, sql);
    } catch (error) {
        console.error("[QueryCache] Error writing to cache:", error);
    }
}

export async function deleteCachedSql(datasetType: string, normalizedQuestion: string): Promise<void> {
    const key = `sql_cache:v${METRIC_VERSION}:${datasetType}:${normalizedQuestion}`;
    try {
        await redis.del(key);
        console.log(`[QueryCache] Deleted key: ${key}`);
    } catch (error) {
        console.error("[QueryCache] Error deleting cache key:", error);
    }
}
