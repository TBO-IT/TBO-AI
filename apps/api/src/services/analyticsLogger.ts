// ─── Analytics Logger ─────────────────────────────────────────────────────────
//
// Structured JSON logging for the entire analytics pipeline.
// Replaces ad-hoc console.log with consistent, parseable log entries.
// ───────────────────────────────────────────────────────────────────────────────

export type LogStage =
    | "ANALYZER"
    | "ROUTER"
    | "ENGINE"
    | "SQL"
    | "CACHE"
    | "ROOTCAUSE"
    | "VALIDATION"
    | "CLAUDE"
    | "ORCHESTRATOR"
    | "GUARDRAIL"
    | "NARRATIVE"
    | "METRICS";

export interface AnalyticsLogEntry {
    timestamp: string;
    stage: LogStage;
    message: string;
    latencyMs?: number;
    rowCount?: number;
    route?: string;
    cacheHit?: boolean;
    validationStatus?: "PASSED" | "FAILED" | "SKIPPED";
    metadata?: Record<string, unknown>;
}

/**
 * Emits a structured JSON log entry to stdout.
 * In production, these can be ingested by CloudWatch, Datadog, etc.
 */
export function logAnalytics(entry: AnalyticsLogEntry): void {
    const logLine: AnalyticsLogEntry = {
        timestamp: new Date().toISOString(),
        ...entry
    };
    console.log(JSON.stringify(logLine));
}

/**
 * Creates a timer that measures elapsed time from creation to stop.
 * Usage:
 *   const timer = startTimer();
 *   // ... do work ...
 *   const elapsed = timer.stop();
 */
export function startTimer(): { stop: () => number } {
    const start = performance.now();
    return {
        stop: () => Math.round(performance.now() - start)
    };
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

export function logAnalyzer(message: string, meta?: Record<string, unknown>): void {
    logAnalytics({ timestamp: "", stage: "ANALYZER", message, metadata: meta });
}

export function logRouter(message: string, route: string, meta?: Record<string, unknown>): void {
    logAnalytics({ timestamp: "", stage: "ROUTER", message, route, metadata: meta });
}

export function logEngine(message: string, route: string, latencyMs?: number, meta?: Record<string, unknown>): void {
    logAnalytics({ timestamp: "", stage: "ENGINE", message, route, latencyMs, metadata: meta });
}

export function logSql(message: string, rowCount?: number, latencyMs?: number): void {
    logAnalytics({ timestamp: "", stage: "SQL", message, rowCount, latencyMs });
}

export function logCache(message: string, cacheHit: boolean): void {
    logAnalytics({ timestamp: "", stage: "CACHE", message, cacheHit });
}

export function logRootCause(message: string, meta?: Record<string, unknown>): void {
    logAnalytics({ timestamp: "", stage: "ROOTCAUSE", message, metadata: meta });
}

export function logValidation(message: string, status: "PASSED" | "FAILED" | "SKIPPED"): void {
    logAnalytics({ timestamp: "", stage: "VALIDATION", message, validationStatus: status });
}

export function logClaude(message: string, latencyMs?: number, meta?: Record<string, unknown>): void {
    logAnalytics({ timestamp: "", stage: "CLAUDE", message, latencyMs, metadata: meta });
}
