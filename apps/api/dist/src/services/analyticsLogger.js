// ─── Analytics Logger ─────────────────────────────────────────────────────────
//
// Structured JSON logging for the entire analytics pipeline.
// Replaces ad-hoc log output with consistent, parseable log entries.
// ───────────────────────────────────────────────────────────────────────────────
import { logger } from "../lib/logger.js";
/**
 * Emits a structured JSON log entry to stdout.
 * In production, these can be ingested by CloudWatch, Datadog, etc.
 */
export function logAnalytics(entry) {
    const logLine = {
        ...entry,
        timestamp: entry.timestamp || new Date().toISOString()
    };
    logger.info(logLine);
}
/**
 * Creates a timer that measures elapsed time from creation to stop.
 * Usage:
 *   const timer = startTimer();
 *   // ... do work ...
 *   const elapsed = timer.stop();
 */
export function startTimer() {
    const start = performance.now();
    return {
        stop: () => Math.round(performance.now() - start)
    };
}
// ─── Convenience helpers ──────────────────────────────────────────────────────
export function logAnalyzer(message, meta) {
    logAnalytics({ timestamp: "", stage: "ANALYZER", message, metadata: meta });
}
export function logRouter(message, route, meta) {
    logAnalytics({ timestamp: "", stage: "ROUTER", message, route, metadata: meta });
}
export function logEngine(message, route, latencyMs, meta) {
    logAnalytics({ timestamp: "", stage: "ENGINE", message, route, latencyMs, metadata: meta });
}
export function logSql(message, rowCount, latencyMs) {
    logAnalytics({ timestamp: "", stage: "SQL", message, rowCount, latencyMs });
}
export function logCache(message, cacheHit) {
    logAnalytics({ timestamp: "", stage: "CACHE", message, cacheHit });
}
export function logRootCause(message, meta) {
    logAnalytics({ timestamp: "", stage: "ROOTCAUSE", message, metadata: meta });
}
export function logValidation(message, status) {
    logAnalytics({ timestamp: "", stage: "VALIDATION", message, validationStatus: status });
}
export function logClaude(message, latencyMs, meta) {
    logAnalytics({ timestamp: "", stage: "CLAUDE", message, latencyMs, metadata: meta });
}
