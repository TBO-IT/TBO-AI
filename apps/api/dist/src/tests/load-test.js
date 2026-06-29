// ─── Load Test ────────────────────────────────────────────────────────────────
//
// Performance test for the deterministic analytics pipeline.
// Runs N queries through Analyzer → Router (no DB, no Claude).
// Measures latency distribution and memory usage.
//
// Usage: npx tsx src/tests/load-test.ts [count]
// ───────────────────────────────────────────────────────────────────────────────
import { analyzeQuestion } from "../ai/questionAnalyzer.js";
import { routeQuery } from "../ai/queryRouter.js";
import { buildSemanticLayer } from "../ai/semanticLayer.js";
const MOCK_SCHEMA = [
    { column_name: "hotel", column_type: "VARCHAR" },
    { column_name: "chain", column_type: "VARCHAR" },
    { column_name: "suppliername", column_type: "VARCHAR" },
    { column_name: "scraped_date", column_type: "VARCHAR" },
    { column_name: "Win", column_type: "BIGINT" },
    { column_name: "Lose", column_type: "BIGINT" },
    { column_name: "status", column_type: "VARCHAR" },
    { column_name: "destination", column_type: "VARCHAR" },
    { column_name: "l2b", column_type: "DOUBLE" },
    { column_name: "apw", column_type: "DOUBLE" },
    { column_name: "apw_bucket", column_type: "VARCHAR" }
];
const TEST_QUERIES = [
    "show me win rate",
    "what is the overall l2b",
    "win rate trend over time",
    "show me monthly win rate trend",
    "compare affiliate vs synxis",
    "compare pattaya and bangkok",
    "which hotels contribute most to win rate",
    "supplier contribution to l2b",
    "why did we lose win rate from april to may",
    "why did l2b increase from q1 to q2",
    "top 10 hotels by win rate",
    "show me win rate for pattaya",
    "what is the average apw",
    "show me win rate by supplier",
    "win rate by destination"
];
async function runLoadTest(queryCount) {
    const sl = buildSemanticLayer(MOCK_SCHEMA);
    const latencies = [];
    const routeDistribution = {};
    const memBefore = process.memoryUsage();
    const startTime = performance.now();
    for (let i = 0; i < queryCount; i++) {
        const query = TEST_QUERIES[i % TEST_QUERIES.length];
        const queryStart = performance.now();
        const analysis = analyzeQuestion(query);
        const routing = routeQuery(analysis, sl);
        const elapsed = performance.now() - queryStart;
        latencies.push(elapsed);
        routeDistribution[routing.route] = (routeDistribution[routing.route] || 0) + 1;
    }
    const totalTime = performance.now() - startTime;
    const memAfter = process.memoryUsage();
    // Compute percentiles
    latencies.sort((a, b) => a - b);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.50)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const memDeltaMB = ((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024).toFixed(2);
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  LOAD TEST RESULTS: ${queryCount} queries`);
    console.log(`${"=".repeat(60)}`);
    console.log(`  Total time:       ${totalTime.toFixed(0)}ms`);
    console.log(`  Throughput:       ${(queryCount / (totalTime / 1000)).toFixed(0)} queries/sec`);
    console.log(`  Avg latency:      ${avg.toFixed(2)}ms`);
    console.log(`  P50 latency:      ${p50.toFixed(2)}ms`);
    console.log(`  P95 latency:      ${p95.toFixed(2)}ms`);
    console.log(`  P99 latency:      ${p99.toFixed(2)}ms`);
    console.log(`  Min latency:      ${latencies[0].toFixed(2)}ms`);
    console.log(`  Max latency:      ${latencies[latencies.length - 1].toFixed(2)}ms`);
    console.log(`  Memory delta:     ${memDeltaMB}MB`);
    console.log(`  Heap used:        ${(memAfter.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`\n  Route Distribution:`);
    for (const [route, count] of Object.entries(routeDistribution).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${route.padEnd(15)} ${count} (${((count / queryCount) * 100).toFixed(1)}%)`);
    }
    console.log(`${"=".repeat(60)}\n`);
}
// Run load tests for 100, 500, 1000 queries
const queryCount = parseInt(process.argv[2] || "100", 10);
runLoadTest(queryCount).catch(console.error);
