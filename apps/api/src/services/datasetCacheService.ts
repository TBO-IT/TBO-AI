import { redis } from "../lib/redis.js";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { supabase } from "../lib/supabase.js";

// ─── Dataset Cache Service ──────────────────────────────────────────────────────
// Caches dataset paths, schemas, and metadata to reduce latency
// Key insight: Dataset rarely changes within a session, so we can cache aggressively
// ────────────────────────────────────────────────────────────────────────────────

const DATASET_CACHE_TTL = 3600; // 1 hour for dataset metadata
const SCHEMA_CACHE_TTL = 86400; // 24 hours for schema (rarely changes)

function hashFile(path: string): string {
    return crypto.createHash("md5").update(path).digest("hex").slice(0, 8);
}

function buildDatasetCacheKey(datasetId: string): string {
    return `dataset:path:${datasetId}`;
}

function buildSchemaCacheKey(csvPath: string): string {
    const hash = hashFile(csvPath);
    return `schema:${hash}`;
}

function buildMetadataCacheKey(datasetId: string): string {
    return `dataset:metadata:v2:${datasetId}`;
}

/**
 * Get cached dataset path or download/fetch from storage
 * This is the main entry point for dataset access
 */
export async function getCachedDatasetPath(
    datasetId: string,
    storagePath: string
): Promise<string> {
    const cacheKey = buildDatasetCacheKey(datasetId);

    try {
        const cachedPath = await redis.get<string>(cacheKey);
        if (cachedPath) {
            // Verify file still exists
            try {
                await fs.access(cachedPath);
                console.log(`[DATASET_CACHE] HIT | datasetId=${datasetId} | path=${cachedPath}`);
                return cachedPath;
            } catch {
                // File was cleaned up, need to re-download
                console.log(`[DATASET_CACHE] EXPIRED | datasetId=${datasetId} | file missing`);
            }
        }
    } catch (error) {
        console.warn(`[DATASET_CACHE] Redis error: ${error}`);
    }

    // Download fresh - use the existing storage service logic
    const fileName = storagePath.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const tempPath = path.join("tmp", fileName);

    try {
        await fs.access(tempPath);
        // File exists locally
    } catch {
        const { data, error } = await supabase.storage
            .from("datasets")
            .download(storagePath);

        if (error) throw error;

        const buffer = Buffer.from(await data.arrayBuffer());
        await fs.mkdir("tmp", { recursive: true });
        await fs.writeFile(tempPath, buffer);
    }

    // Cache the path
    try {
        await redis.setex(cacheKey, DATASET_CACHE_TTL, tempPath);
    } catch (error) {
        console.warn(`[DATASET_CACHE] Failed to cache: ${error}`);
    }

    console.log(`[DATASET_CACHE] MISS | datasetId=${datasetId} | path=${tempPath}`);
    return tempPath;
}

/**
 * Cache the schema for a dataset (based on file path)
 */
export async function getCachedSchema(
    csvPath: string,
    fetchSchema: () => Promise<any[]>
): Promise<any[]> {
    const cacheKey = buildSchemaCacheKey(csvPath);

    try {
        const cached = await redis.get<string>(cacheKey);
        if (cached) {
            console.log(`[SCHEMA_CACHE] HIT | path=${csvPath.slice(-30)}`);
            return JSON.parse(cached);
        }
    } catch (error) {
        console.warn(`[SCHEMA_CACHE] Redis error: ${error}`);
    }

    const schema = await fetchSchema();

    try {
        await redis.setex(cacheKey, SCHEMA_CACHE_TTL, JSON.stringify(schema));
    } catch (error) {
        console.warn(`[SCHEMA_CACHE] Failed to cache: ${error}`);
    }

    console.log(`[SCHEMA_CACHE] MISS | path=${csvPath.slice(-30)}`);
    return schema;
}

/**
 * Cache full dataset metadata (schema + sample + stats)
 */
export async function getCachedMetadata(
    datasetId: string,
    csvPath: string,
    fetchMetadata: () => Promise<any>
): Promise<any> {
    const cacheKey = buildMetadataCacheKey(datasetId);

    try {
        const cached = await redis.get<string>(cacheKey);
        if (cached) {
            console.log(`[METADATA_CACHE] HIT | datasetId=${datasetId}`);
            return JSON.parse(cached);
        }
    } catch (error) {
        console.warn(`[METADATA_CACHE] Redis error: ${error}`);
    }

    const metadata = await fetchMetadata();

    try {
        await redis.setex(cacheKey, DATASET_CACHE_TTL, JSON.stringify(metadata));
    } catch (error) {
        console.warn(`[METADATA_CACHE] Failed to cache: ${error}`);
    }

    console.log(`[METADATA_CACHE] MISS | datasetId=${datasetId}`);
    return metadata;
}

/**
 * Invalidate all caches for a dataset
 */
export async function invalidateDatasetCache(datasetId: string): Promise<void> {
    try {
        const pathKey = buildDatasetCacheKey(datasetId);
        const metaKey = buildMetadataCacheKey(datasetId);
        await redis.del(pathKey);
        await redis.del(metaKey);
        console.log(`[CACHE_INVALIDATED] datasetId=${datasetId}`);
    } catch (error) {
        console.warn(`[CACHE_INVALIDATE] Failed: ${error}`);
    }
}