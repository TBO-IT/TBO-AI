// ─── Analytics Metrics Service ────────────────────────────────────────────────
//
// In-memory metrics tracker for the analytics platform.
// Tracks query count, route distribution, cache hit rate, latency percentiles,
// error rate, and contradiction rate. Exposes a snapshot for dashboards.
// ───────────────────────────────────────────────────────────────────────────────

interface LatencyEntry {
    timestamp: number;
    latencyMs: number;
}

interface MetricsState {
    queryCount: number;
    routeDistribution: Record<string, number>;
    cacheHits: number;
    cacheMisses: number;
    errors: number;
    contradictions: number;
    latencies: LatencyEntry[];
}

const state: MetricsState = {
    queryCount: 0,
    routeDistribution: {},
    cacheHits: 0,
    cacheMisses: 0,
    errors: 0,
    contradictions: 0,
    latencies: []
};

// Keep at most 10,000 latency entries to prevent memory leaks
const MAX_LATENCY_ENTRIES = 10_000;

// ─── Recording Functions ──────────────────────────────────────────────────────

export function recordQuery(route: string, latencyMs: number): void {
    state.queryCount++;
    state.routeDistribution[route] = (state.routeDistribution[route] || 0) + 1;
    
    state.latencies.push({ timestamp: Date.now(), latencyMs });
    if (state.latencies.length > MAX_LATENCY_ENTRIES) {
        state.latencies = state.latencies.slice(-MAX_LATENCY_ENTRIES);
    }
}

export function recordCacheHit(): void {
    state.cacheHits++;
}

export function recordCacheMiss(): void {
    state.cacheMisses++;
}

export function recordError(): void {
    state.errors++;
}

export function recordContradiction(): void {
    state.contradictions++;
}

// ─── Snapshot Functions ───────────────────────────────────────────────────────

function computePercentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

export interface MetricsSnapshot {
    queryCount: number;
    routeDistribution: Record<string, number>;
    cacheHitRate: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    errorRate: number;
    contradictionRate: number;
    uptimeSecs: number;
}

const startTime = Date.now();

/**
 * Returns a complete metrics snapshot suitable for dashboard consumption.
 */
export function getMetrics(): MetricsSnapshot {
    const totalCacheOps = state.cacheHits + state.cacheMisses;
    const cacheHitRate = totalCacheOps > 0 ? state.cacheHits / totalCacheOps : 0;

    const sortedLatencies = state.latencies.map(e => e.latencyMs).sort((a, b) => a - b);
    const avgLatency = sortedLatencies.length > 0
        ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length
        : 0;

    const errorRate = state.queryCount > 0 ? state.errors / state.queryCount : 0;
    const contradictionRate = state.queryCount > 0 ? state.contradictions / state.queryCount : 0;

    return {
        queryCount: state.queryCount,
        routeDistribution: { ...state.routeDistribution },
        cacheHitRate: +cacheHitRate.toFixed(4),
        avgLatencyMs: Math.round(avgLatency),
        p50LatencyMs: computePercentile(sortedLatencies, 50),
        p95LatencyMs: computePercentile(sortedLatencies, 95),
        p99LatencyMs: computePercentile(sortedLatencies, 99),
        errorRate: +errorRate.toFixed(4),
        contradictionRate: +contradictionRate.toFixed(4),
        uptimeSecs: Math.round((Date.now() - startTime) / 1000)
    };
}

/**
 * Resets all metrics (useful for testing).
 */
export function resetMetrics(): void {
    state.queryCount = 0;
    state.routeDistribution = {};
    state.cacheHits = 0;
    state.cacheMisses = 0;
    state.errors = 0;
    state.contradictions = 0;
    state.latencies = [];
}
