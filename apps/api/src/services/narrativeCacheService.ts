import { redis } from "../lib/redis.js";
import crypto from "crypto";
import type { ResponseSource } from "./claudeRequestDetector.js";

// ─── Narrative Cache Service (v2) ─────────────────────────────────────────────
//
// Cache keys now include responseSource to prevent cross-type contamination.
// Cache values are JSON envelopes with metadata for validation.
//
// Key format:
//   narrative_cache:v2:{datasetId}:{questionHash}:{sqlHash}:{responseSource}
//
// Value format:
//   { narrative, responseSource, createdAt }
// ───────────────────────────────────────────────────────────────────────────────

/** Cache version — bump to invalidate all legacy entries */
const NARRATIVE_CACHE_VERSION = 31;

/** TTL of 24 hours */
const CACHE_TTL = 60 * 60 * 24;

/** Structured cache envelope stored in Redis */
interface NarrativeCacheEntry {
    narrative: string;
    responseSource: ResponseSource;
    createdAt: string; // ISO-8601
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashString(input: string): string {
    return crypto.createHash("md5").update(input).digest("hex");
}

function buildCacheKey(
    datasetId: string,
    question: string,
    sqlHash: string,
    responseSource: ResponseSource
): string {
    const questionHash = hashString(question);
    return `narrative_cache:v${NARRATIVE_CACHE_VERSION}:${datasetId}:${questionHash}:${sqlHash}:${responseSource}`;
}

/**
 * Type-guard: validates that a parsed value is a well-formed NarrativeCacheEntry.
 */
function isValidCacheEntry(value: unknown): value is NarrativeCacheEntry {
    if (typeof value !== "object" || value === null) return false;
    const obj = value as Record<string, unknown>;
    return (
        typeof obj.narrative === "string" &&
        typeof obj.responseSource === "string" &&
        typeof obj.createdAt === "string"
    );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Retrieves a cached narrative for the given parameters.
 *
 * Returns `null` on:
 *   - cache miss
 *   - legacy raw-string entry (migration safety)
 *   - responseSource mismatch (double-validation)
 */
export async function getCachedNarrative(
    datasetId: string,
    question: string,
    sql: string,
    responseSource: ResponseSource
): Promise<string | null> {
    const sqlHash = hashString(sql);
    const key = buildCacheKey(datasetId, question, sqlHash, responseSource);

    try {
        const raw = await redis.get<string | NarrativeCacheEntry>(key);

        if (raw === null || raw === undefined) {
            console.log(`[NARRATIVE_CACHE] MISS | responseSource=${responseSource} | key=${key}`);
            return null;
        }

        // ── Migration safety: legacy raw-string entries ───────────────────
        if (typeof raw === "string") {
            console.warn(
                `[NARRATIVE_CACHE] LEGACY_FORMAT | treating as MISS | key=${key}`
            );
            return null;
        }

        // ── Parse structured entry ────────────────────────────────────────
        const entry: unknown = raw;

        if (!isValidCacheEntry(entry)) {
            console.warn(
                `[NARRATIVE_CACHE] INVALID_ENTRY | treating as MISS | key=${key}`
            );
            return null;
        }

        // ── Double-validate responseSource (defense in depth) ─────────────
        if (entry.responseSource !== responseSource) {
            console.warn(
                `[NARRATIVE_CACHE] TYPE_MISMATCH | cached=${entry.responseSource} | requested=${responseSource} | key=${key}`
            );
            return null;
        }

        console.log(
            `[NARRATIVE_CACHE] HIT | responseSource=${responseSource} | ` +
            `createdAt=${entry.createdAt} | chars=${entry.narrative.length} | key=${key}`
        );
        return entry.narrative;
    } catch (error) {
        console.error("[NARRATIVE_CACHE] Error reading from cache:", error);
        return null;
    }
}

/**
 * Stores a narrative in the cache with full metadata envelope.
 */
export async function setCachedNarrative(
    datasetId: string,
    question: string,
    sql: string,
    narrative: string,
    responseSource: ResponseSource
): Promise<void> {
    const sqlHash = hashString(sql);
    const key = buildCacheKey(datasetId, question, sqlHash, responseSource);

    const entry: NarrativeCacheEntry = {
        narrative,
        responseSource,
        createdAt: new Date().toISOString(),
    };

    try {
        await redis.setex(key, CACHE_TTL, JSON.stringify(entry));
        console.log(
            `[NARRATIVE_CACHE] SET | responseSource=${responseSource} | ` +
            `chars=${narrative.length} | key=${key}`
        );
    } catch (error) {
        console.error("[NARRATIVE_CACHE] Error writing to cache:", error);
    }
}

/**
 * Invalidates all narrative cache entries for a given dataset.
 * Useful for manual cache busting during deployments.
 *
 * Note: Version bumping (NARRATIVE_CACHE_VERSION) already makes old entries
 * inaccessible. This function is for explicit per-dataset invalidation.
 */
export async function invalidateNarrativeCache(datasetId: string): Promise<number> {
    const pattern = `narrative_cache:v${NARRATIVE_CACHE_VERSION}:${datasetId}:*`;
    try {
        // Upstash Redis supports scan-based deletion
        const keys = await redis.keys(pattern);
        if (keys.length === 0) {
            console.log(`[NARRATIVE_CACHE] INVALIDATE | datasetId=${datasetId} | deleted=0`);
            return 0;
        }

        // Delete in batch
        await Promise.all(keys.map(k => redis.del(k)));
        console.log(`[NARRATIVE_CACHE] INVALIDATE | datasetId=${datasetId} | deleted=${keys.length}`);
        return keys.length;
    } catch (error) {
        console.error("[NARRATIVE_CACHE] Error invalidating cache:", error);
        return 0;
    }
}
