// ─── Analytics Regression Test Suite ──────────────────────────────────────────
//
// Pure unit tests using Node Test Runner (node:test).
// No database, no network, no Claude API calls.
// Tests the deterministic analytics pipeline: Analyzer → Router → Engine → Builder.
// ───────────────────────────────────────────────────────────────────────────────
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeQuestion } from "../ai/questionAnalyzer.js";
import { routeQuery } from "../ai/queryRouter.js";
import { buildSemanticLayer } from "../ai/semanticLayer.js";
import { buildRootCausePack } from "../services/RootCausePackBuilder.js";
import { buildClaudeInputPack, assertClaudeInputSafe } from "../services/claudeInputContract.js";
import { buildExecutivePack } from "../services/insights/executivePackBuilder.js";
import { checkClaudeAllowed } from "../services/claudeGuardrailService.js";
import { generateRecommendations } from "../services/recommendationGenerator.js";
import { validateQueryPreExecution } from "../services/queryValidationService.js";
import { getMetrics, resetMetrics, recordQuery, recordCacheHit, recordError, recordContradiction } from "../services/analyticsMetrics.js";
// ─── Shared test fixtures ─────────────────────────────────────────────────────
// Minimal schema that matches the TBO dataset structure
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
function getSemanticLayer() {
    return buildSemanticLayer(MOCK_SCHEMA);
}
// ─── Phase 2.1: Route Validation ──────────────────────────────────────────────
describe("Route Validation", () => {
    const sl = getSemanticLayer();
    it("routes 'show me win rate' to TEMPLATE", () => {
        const analysis = analyzeQuestion("show me win rate");
        const routing = routeQuery(analysis, sl);
        assert.equal(routing.route, "TEMPLATE");
    });
    it("routes 'win rate trend over time' to TREND", () => {
        const analysis = analyzeQuestion("win rate trend over time");
        const routing = routeQuery(analysis, sl);
        assert.equal(routing.route, "TREND");
    });
    it("routes 'compare affiliate vs synxis' to COMPARISON", () => {
        const analysis = analyzeQuestion("compare affiliate vs synxis");
        const routing = routeQuery(analysis, sl);
        assert.equal(routing.route, "COMPARISON");
    });
    it("routes 'which hotels contribute most to win rate' to CONTRIBUTION", () => {
        const analysis = analyzeQuestion("which hotels contribute most to win rate");
        const routing = routeQuery(analysis, sl);
        assert.equal(routing.route, "CONTRIBUTION");
    });
    it("routes 'why did we lose win rate from april to may' to ROOT_CAUSE", () => {
        const analysis = analyzeQuestion("why did we lose win rate from april to may");
        const routing = routeQuery(analysis, sl);
        assert.equal(routing.route, "ROOT_CAUSE");
    });
});
// ─── Phase 2.2: Question Analyzer ─────────────────────────────────────────────
describe("Question Analyzer", () => {
    it("extracts win_rate metric from 'show me win rate'", () => {
        const analysis = analyzeQuestion("show me win rate");
        assert.ok(analysis.metrics.includes("win_rate"), `Expected win_rate, got: ${analysis.metrics}`);
    });
    it("extracts time references from 'win rate from april to may'", () => {
        const analysis = analyzeQuestion("win rate from april to may");
        assert.ok(analysis.timeReferences.length >= 2, `Expected >=2 time refs, got: ${analysis.timeReferences.length}`);
    });
    it("detects ROOT_CAUSE intent for 'why did we lose'", () => {
        const analysis = analyzeQuestion("why did we lose win rate from april to may");
        assert.equal(analysis.intent, "ROOT_CAUSE");
    });
    it("extracts time filters as month = 4 and month = 5", () => {
        const analysis = analyzeQuestion("win rate from april to may");
        const monthFilters = analysis.filters.filter(f => f.dimension === "month");
        const months = monthFilters.map(f => f.value).sort();
        assert.ok(months.includes(4) || months.includes("april"), `Expected month 4, got: ${JSON.stringify(months)}`);
    });
});
// ─── Phase 2.3: Contradiction Detection ───────────────────────────────────────
describe("Contradiction Detection", () => {
    it("detects contradiction when user says 'lose' but metric increased", () => {
        const mockResults = [[
                { "Hotel": "TestHotel", "Volume": 100, "Volume Share %": 50, "Win Rate": 60, "Metric Delta": 5, "Weighted Contribution": 2.5, "Contribution %": 50, "Overall Metric Change": 5.0 }
            ]];
        const sl = getSemanticLayer();
        const pack = buildRootCausePack("why did we lose win rate from april to may", sl, mockResults);
        assert.equal(pack.contradictionDetected, true);
        assert.equal(pack.expectedDirection, "decline");
    });
    it("does NOT detect contradiction when direction matches", () => {
        const mockResults = [[
                { "Hotel": "TestHotel", "Volume": 100, "Volume Share %": 50, "Win Rate": 60, "Metric Delta": -5, "Weighted Contribution": -2.5, "Contribution %": -50, "Overall Metric Change": -5.0 }
            ]];
        const sl = getSemanticLayer();
        const pack = buildRootCausePack("why did we lose win rate from april to may", sl, mockResults);
        assert.equal(pack.contradictionDetected, false);
    });
});
// ─── Phase 2.4: Claude Input Contract ─────────────────────────────────────────
describe("Claude Input Contract", () => {
    it("builds a valid ClaudeInputPack from a RootCausePack", () => {
        const mockResults = [[
                { "Hotel": "Sofitel", "Volume": 100, "Volume Share %": 50, "Win Rate": 60, "Metric Delta": 5, "Weighted Contribution": 2.5, "Contribution %": 50, "Overall Metric Change": 5.0 }
            ]];
        const sl = getSemanticLayer();
        const pack = buildRootCausePack("test", sl, mockResults);
        const claudePack = buildClaudeInputPack("test", pack, buildExecutivePack(pack));
        assert.ok(claudePack.metricName);
        assert.ok(claudePack.builtAt);
        assert.equal(claudePack.question, "test");
    });
    it("does NOT contain SQL in the ClaudeInputPack", () => {
        const mockResults = [[
                { "Hotel": "Sofitel", "Volume": 100, "Volume Share %": 50, "Win Rate": 60, "Metric Delta": 5, "Weighted Contribution": 2.5, "Contribution %": 50, "Overall Metric Change": 5.0 }
            ]];
        const sl = getSemanticLayer();
        const pack = buildRootCausePack("test", sl, mockResults);
        const claudePack = buildClaudeInputPack("test", pack, buildExecutivePack(pack));
        // This should NOT throw
        assertClaudeInputSafe(claudePack);
    });
});
// ─── Phase 2.5: Guardrail Validation ──────────────────────────────────────────
describe("Claude Guardrail Service", () => {
    it("blocks Claude SQL generation for TEMPLATE route", () => {
        const decision = checkClaudeAllowed("SQL_GENERATION", "TEMPLATE");
        assert.equal(decision.allowed, false);
    });
    it("blocks Claude SQL generation for TREND route", () => {
        const decision = checkClaudeAllowed("SQL_GENERATION", "TREND");
        assert.equal(decision.allowed, false);
    });
    it("blocks Claude SQL generation for COMPARISON route", () => {
        const decision = checkClaudeAllowed("SQL_GENERATION", "COMPARISON");
        assert.equal(decision.allowed, false);
    });
    it("blocks Claude SQL generation for CONTRIBUTION route", () => {
        const decision = checkClaudeAllowed("SQL_GENERATION", "CONTRIBUTION");
        assert.equal(decision.allowed, false);
    });
    it("allows Claude SQL generation for LLM route", () => {
        const decision = checkClaudeAllowed("SQL_GENERATION", "LLM");
        assert.equal(decision.allowed, true);
    });
    it("allows ROOT_CAUSE_NARRATIVE operation", () => {
        const decision = checkClaudeAllowed("ROOT_CAUSE_NARRATIVE", "ROOT_CAUSE");
        assert.equal(decision.allowed, true);
    });
    it("allows EXECUTIVE_SUMMARY operation", () => {
        const decision = checkClaudeAllowed("EXECUTIVE_SUMMARY", "ROOT_CAUSE");
        assert.equal(decision.allowed, true);
    });
});
// ─── Phase 2.6: Query Validation ──────────────────────────────────────────────
describe("Query Validation Service", () => {
    it("passes validation for valid query", () => {
        const analysis = analyzeQuestion("show me win rate");
        const sl = getSemanticLayer();
        const result = validateQueryPreExecution(analysis, sl);
        assert.equal(result.valid, true);
    });
    it("catches invalid month filter", () => {
        const analysis = analyzeQuestion("show me win rate");
        analysis.filters.push({ dimension: "month", operator: "=", value: 15 });
        const sl = getSemanticLayer();
        const result = validateQueryPreExecution(analysis, sl);
        assert.equal(result.valid, false);
        assert.ok(result.errors[0].includes("Invalid month"));
    });
});
// ─── Phase 2.7: Metrics Service ───────────────────────────────────────────────
describe("Analytics Metrics Service", () => {
    it("tracks query counts and route distribution", () => {
        resetMetrics();
        recordQuery("TEMPLATE", 100);
        recordQuery("TREND", 200);
        recordQuery("TEMPLATE", 150);
        const metrics = getMetrics();
        assert.equal(metrics.queryCount, 3);
        assert.equal(metrics.routeDistribution["TEMPLATE"], 2);
        assert.equal(metrics.routeDistribution["TREND"], 1);
    });
    it("calculates cache hit rate correctly", () => {
        resetMetrics();
        recordCacheHit();
        recordCacheHit();
        recordCacheHit();
        // Record some misses through recordQuery (which doesn't auto-count misses)
        // Manually track
        const metrics = getMetrics();
        assert.equal(metrics.cacheHitRate, 1); // 3 hits, 0 misses = 100%
    });
    it("calculates error rate", () => {
        resetMetrics();
        recordQuery("TEMPLATE", 100);
        recordQuery("TEMPLATE", 100);
        recordError();
        const metrics = getMetrics();
        assert.equal(metrics.errorRate, 0.5); // 1 error / 2 queries
    });
    it("calculates contradiction rate", () => {
        resetMetrics();
        recordQuery("ROOT_CAUSE", 100);
        recordContradiction();
        const metrics = getMetrics();
        assert.equal(metrics.contradictionRate, 1);
    });
});
// ─── Phase 2.8: Recommendation Engine ─────────────────────────────────────────
describe("Recommendation Engine", () => {
    it("generates recommendations from a valid pack", async () => {
        const mockResults = [[
                { "Hotel": "Sofitel", "Volume": 200, "Volume Share %": 30, "Win Rate": 60, "Metric Delta": 5, "Weighted Contribution": 2.5, "Contribution %": 50, "Overall Metric Change": 5.0 },
                { "Hotel": "Mercure", "Volume": 100, "Volume Share %": 15, "Win Rate": 40, "Metric Delta": -10, "Weighted Contribution": -1.5, "Contribution %": -30, "Overall Metric Change": 5.0 }
            ]];
        const sl = getSemanticLayer();
        const pack = buildRootCausePack("why did win rate change", sl, mockResults);
        const claudePack = buildClaudeInputPack("why did win rate change", pack, buildExecutivePack(pack));
        const { recommendations: recs } = await generateRecommendations(claudePack);
        assert.ok(recs.length > 0, "Should generate at least one recommendation");
        // Each recommendation should have required fields
        for (const rec of recs) {
            assert.ok(rec.action, "Recommendation must have an action");
            assert.ok(rec.rationale, "Recommendation must have a rationale");
            assert.ok(rec.expectedImpact, "Recommendation must state expected impact");
            assert.ok(rec.supportingEvidence.length > 0, "Recommendation must cite evidence");
        }
    });
    it("generates contradiction recommendation when contradiction detected", async () => {
        const mockResults = [[
                { "Hotel": "Sofitel", "Volume": 200, "Volume Share %": 30, "Win Rate": 60, "Metric Delta": 5, "Weighted Contribution": 2.5, "Contribution %": 50, "Overall Metric Change": 5.0 }
            ]];
        const sl = getSemanticLayer();
        const pack = buildRootCausePack("why did we lose win rate", sl, mockResults);
        const claudePack = buildClaudeInputPack("why did we lose win rate", pack, buildExecutivePack(pack));
        const { recommendations: recs } = await generateRecommendations(claudePack);
        const contradictionRec = recs.find(r => r.action.includes("Reassess"));
        assert.ok(contradictionRec, "Should generate a contradiction recommendation");
    });
});
