// ─── Claude Integration Test Suite ────────────────────────────────────────────
//
// Tests all Claude integration components WITHOUT making actual API calls.
// Validates: routing, contract safety, cost tracking, failover, tier selection,
// prompt construction, narrative generation, recommendation generation.
// ───────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { routeClaude, shouldUseClaude, selectClaudeTier } from "../services/claudeRouter.js";
import { buildClaudeInputPack, assertClaudeInputSafe, ClaudeInputPack } from "../services/claudeInputContract.js";
import { buildExecutivePack } from "../services/insights/executivePackBuilder.js";
import { trackClaudeUsage, getCostDashboard, resetUsageLog, estimateCost } from "../services/claudeCostTracker.js";
import { generateNarrative } from "../services/narrativeGenerator.js";
import { generateRecommendations } from "../services/recommendationGenerator.js";
import { buildRootCausePack, RootCausePack } from "../services/RootCausePackBuilder.js";
import { buildSemanticLayer } from "../ai/semanticLayer.js";

// ─── Test Fixtures ────────────────────────────────────────────────────────────

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

function buildTestPack(): ClaudeInputPack {
    const sl = buildSemanticLayer(MOCK_SCHEMA);
    const mockResults: Record<string, unknown>[][] = [[
        { "Hotel": "Sofitel Bangkok", "Volume": 200, "Volume Share %": 30, "Win Rate": 65, "Metric Delta": 8, "Weighted Contribution": 2.4, "Contribution %": 49, "Overall Metric Change": 4.88 },
        { "Hotel": "Mercure Sydney", "Volume": 100, "Volume Share %": 15, "Win Rate": 40, "Metric Delta": -12, "Weighted Contribution": -1.8, "Contribution %": -37, "Overall Metric Change": 4.88 }
    ]];
    const pack = buildRootCausePack("why did win rate change from april to may", sl, mockResults);
    return buildClaudeInputPack("why did win rate change from april to may", pack, buildExecutivePack(pack));
}

function buildContradictionPack(): ClaudeInputPack {
    const sl = buildSemanticLayer(MOCK_SCHEMA);
    const mockResults: Record<string, unknown>[][] = [[
        { "Hotel": "Sofitel", "Volume": 200, "Volume Share %": 30, "Win Rate": 65, "Metric Delta": 8, "Weighted Contribution": 2.4, "Contribution %": 49, "Overall Metric Change": 4.88 }
    ]];
    const pack = buildRootCausePack("why did we lose win rate from april to may", sl, mockResults);
    return buildClaudeInputPack("why did we lose win rate from april to may", pack, buildExecutivePack(pack));
}

// ─── 1. Claude Router — Tier Selection ────────────────────────────────────────

describe("Claude Router", () => {
    it("returns NONE for TEMPLATE route", () => {
        const decision = routeClaude("TEMPLATE", null, false);
        assert.equal(decision.shouldCallClaude, false);
        assert.equal(decision.tier, "NONE");
    });

    it("returns NONE for TREND route", () => {
        const decision = routeClaude("TREND", null, false);
        assert.equal(decision.shouldCallClaude, false);
        assert.equal(decision.tier, "NONE");
    });

    it("returns NONE for COMPARISON route", () => {
        const decision = routeClaude("COMPARISON", null, false);
        assert.equal(decision.shouldCallClaude, false);
    });

    it("returns NONE for CONTRIBUTION route", () => {
        const decision = routeClaude("CONTRIBUTION", null, false);
        assert.equal(decision.shouldCallClaude, false);
    });

    it("returns HAIKU for NARRATIVE_GENERATION on ROOT_CAUSE with pack", () => {
        const decision = routeClaude("ROOT_CAUSE", "NARRATIVE_GENERATION", true);
        assert.equal(decision.shouldCallClaude, true);
        assert.equal(decision.tier, "HAIKU");
    });

    it("returns SONNET for RECOMMENDATIONS on ROOT_CAUSE with pack", () => {
        const decision = routeClaude("ROOT_CAUSE", "RECOMMENDATIONS", true);
        assert.equal(decision.shouldCallClaude, true);
        assert.equal(decision.tier, "SONNET");
    });

    it("returns SONNET for LLM route (ad-hoc reasoning)", () => {
        const decision = routeClaude("LLM", "RECOMMENDATIONS", false);
        assert.equal(decision.shouldCallClaude, true);
        assert.equal(decision.tier, "SONNET");
    });

    it("selects HAIKU for EXECUTIVE_SUMMARY", () => {
        assert.equal(selectClaudeTier("EXECUTIVE_SUMMARY"), "HAIKU");
    });

    it("selects SONNET for STRATEGIC_ANALYSIS", () => {
        assert.equal(selectClaudeTier("STRATEGIC_ANALYSIS"), "SONNET");
    });

    it("shouldUseClaude returns false for deterministic routes", () => {
        assert.equal(shouldUseClaude("TEMPLATE"), false);
        assert.equal(shouldUseClaude("TREND"), false);
        assert.equal(shouldUseClaude("COMPARISON"), false);
        assert.equal(shouldUseClaude("CONTRIBUTION"), false);
        assert.equal(shouldUseClaude("CACHE"), false);
    });

    it("shouldUseClaude returns true for ROOT_CAUSE", () => {
        assert.equal(shouldUseClaude("ROOT_CAUSE"), true);
    });
});

// ─── 2. Claude Input Contract — Safety ────────────────────────────────────────

describe("Claude Input Contract", () => {
    it("builds a valid ClaudeInputPack with all required fields", () => {
        const pack = buildTestPack();
        assert.ok(pack.metricName);
        assert.ok(pack.builtAt);
        assert.ok(pack.question);
        assert.ok(Array.isArray(pack.executivePack.topDrivers));
        assert.ok(Array.isArray(pack.executivePack.topRisks));
        assert.ok(["PASSED", "FAILED", "UNKNOWN"].includes(pack.validationStatus));
    });

    it("passes safety assertion for a clean pack", () => {
        const pack = buildTestPack();
        assert.doesNotThrow(() => assertClaudeInputSafe(pack));
    });

    it("rejects a pack containing SQL patterns", () => {
        const pack = buildTestPack();
        // Inject SQL — this simulates a leak
        (pack as any).metricName = "SELECT * FROM data_table";
        assert.throws(
            () => assertClaudeInputSafe(pack),
            /SECURITY VIOLATION/
        );
    });

    it("rejects a pack containing file paths", () => {
        const pack = buildTestPack();
        (pack as any).metricName = "C:\\\\Users\\\\test\\.csv";
        assert.throws(
            () => assertClaudeInputSafe(pack),
            /SECURITY VIOLATION/
        );
    });

    it("impact scores are finite", () => {
        const pack = buildTestPack();
        for (const c of [...pack.executivePack.topDrivers]) {
            assert.ok(isFinite(c.impactScore), `impactScore is not finite: ${c.impactScore}`);
        }
    });
});

// ─── 3. Contradiction Handling ────────────────────────────────────────────────

describe("Contradiction Handling", () => {
    it("detects contradiction and flags it in the pack", () => {
        const pack = buildContradictionPack();
        assert.equal(pack.contradictionDetected, true);
        assert.equal(pack.expectedDirection, "decline");
    });

    it("narrative generator handles contradiction deterministically", async () => {
        const pack = buildContradictionPack();
        const narrative = await generateNarrative(pack);
        assert.ok(narrative.executiveSummary.includes("Contradiction"));
        assert.ok(narrative.contradictionNote);
    });
});

// ─── 4. Narrative Generation (Deterministic) ─────────────────────────────────

describe("Narrative Generator (Deterministic)", () => {
    it("generates a narrative without Claude (enableClaude=false)", async () => {
        const pack = buildTestPack();
        const narrative = await generateNarrative(pack);
        assert.ok(narrative.executiveSummary.length > 0);
        assert.equal(narrative.claudeUsed, false);
    });

    it("includes key drivers from positive contributors", async () => {
        const pack = buildTestPack();
        const narrative = await generateNarrative(pack);
        assert.ok(narrative.keyDrivers.length > 0);
    });

    it("includes risks from negative contributors", async () => {
        const pack = buildTestPack();
        const narrative = await generateNarrative(pack);
        assert.ok(narrative.risks.length > 0);
    });
});

// ─── 5. Recommendation Generator (Deterministic) ─────────────────────────────

describe("Recommendation Generator (Deterministic)", () => {
    it("generates recommendations without Claude", async () => {
        const pack = buildTestPack();
        const result = await generateRecommendations(pack);
        assert.ok(result.recommendations.length > 0);
        assert.equal(result.claudeUsed, false);
    });

    it("each recommendation has required fields", async () => {
        const pack = buildTestPack();
        const result = await generateRecommendations(pack);
        for (const rec of result.recommendations) {
            assert.ok(rec.action, "Missing action");
            assert.ok(rec.rationale, "Missing rationale");
            assert.ok(Array.isArray(rec.supportingEvidence), "Missing evidence");
            assert.ok(rec.expectedImpact, "Missing impact");
        }
    });

    it("generates contradiction recommendation when detected", async () => {
        const pack = buildContradictionPack();
        const result = await generateRecommendations(pack);
        const contradictionRec = result.recommendations.find(r => r.action.includes("Reassess"));
        assert.ok(contradictionRec, "Expected contradiction recommendation");
    });
});

// ─── 6. Cost Tracking ─────────────────────────────────────────────────────────

describe("Claude Cost Tracker", () => {
    it("tracks a single usage entry", () => {
        resetUsageLog();
        trackClaudeUsage("claude-3-5-haiku-20241022", "NARRATIVE", 500, 200, 450);

        const dashboard = getCostDashboard();
        assert.equal(dashboard.daily.callCount, 1);
        assert.ok(dashboard.daily.totalCostUsd > 0);
        assert.equal(dashboard.daily.totalInputTokens, 500);
        assert.equal(dashboard.daily.totalOutputTokens, 200);
    });

    it("tracks multiple usage entries", () => {
        resetUsageLog();
        trackClaudeUsage("claude-3-5-haiku-20241022", "NARRATIVE", 500, 200, 300);
        trackClaudeUsage("claude-3-5-sonnet-20241022", "RECOMMENDATIONS", 1000, 800, 600);

        const dashboard = getCostDashboard();
        assert.equal(dashboard.daily.callCount, 2);
        assert.ok(dashboard.modelBreakdown["claude-3-5-haiku-20241022"]);
        assert.ok(dashboard.modelBreakdown["claude-3-5-sonnet-20241022"]);
    });

    it("estimates cost correctly for Haiku", () => {
        const est = estimateCost("claude-3-5-haiku-20241022", 1000, 500);
        // Haiku: $0.25/1M input + $1.25/1M output
        const expected = (1000 / 1_000_000) * 0.25 + (500 / 1_000_000) * 1.25;
        assert.equal(est.costUsd, +expected.toFixed(6));
    });

    it("estimates cost correctly for Sonnet", () => {
        const est = estimateCost("claude-3-5-sonnet-20241022", 1000, 500);
        // Sonnet: $3/1M input + $15/1M output
        const expected = (1000 / 1_000_000) * 3.00 + (500 / 1_000_000) * 15.00;
        assert.equal(est.costUsd, +expected.toFixed(6));
    });

    it("provides model breakdown", () => {
        resetUsageLog();
        trackClaudeUsage("claude-3-5-haiku-20241022", "NARRATIVE", 500, 200, 300);
        trackClaudeUsage("claude-3-5-haiku-20241022", "NARRATIVE", 600, 300, 350);

        const dashboard = getCostDashboard();
        assert.equal(dashboard.modelBreakdown["claude-3-5-haiku-20241022"].calls, 2);
    });

    it("provides operation breakdown", () => {
        resetUsageLog();
        trackClaudeUsage("claude-3-5-sonnet-20241022", "RECOMMENDATIONS", 1000, 800, 600);

        const dashboard = getCostDashboard();
        assert.equal(dashboard.operationBreakdown["RECOMMENDATIONS"].calls, 1);
    });
});

// ─── 7. Failover ──────────────────────────────────────────────────────────────

describe("Failover", () => {
    it("narrative generator falls back to deterministic when enableClaude=false", async () => {
        const pack = buildTestPack();
        const narrative = await generateNarrative(pack);
        assert.equal(narrative.claudeUsed, false);
        assert.equal(narrative.claudeFailed, false);
        assert.ok(narrative.executiveSummary.length > 0);
    });

    it("recommendation generator falls back to deterministic when enableClaude=false", async () => {
        const pack = buildTestPack();
        const result = await generateRecommendations(pack);
        assert.equal(result.claudeUsed, false);
        assert.ok(result.recommendations.length > 0);
    });
});

// ─── 8. Prompt Construction Safety ───────────────────────────────────────────

describe("Prompt Construction Safety", () => {
    it("ClaudeInputPack serializes without SQL or file paths", () => {
        const pack = buildTestPack();
        const json = JSON.stringify(pack);

        assert.ok(!json.includes("SELECT"), "Pack contains SQL keyword SELECT");
        assert.ok(!json.includes("FROM data_table"), "Pack contains data_table reference");
        assert.ok(!json.includes(".csv"), "Pack contains .csv reference");
        assert.ok(!json.includes("read_csv_auto"), "Pack contains DuckDB function");
        assert.ok(!json.includes("GROUP BY"), "Pack contains SQL GROUP BY");
    });

    it("contributor names are strings not numbers", () => {
        const pack = buildTestPack();
        for (const c of [...pack.executivePack.topDrivers]) {
            assert.ok(typeof c.name === "string", "Name is not a string");
            assert.ok(isNaN(Number(c.name)) || c.name.trim() === "", `Name "${c.name}" looks numeric (entity attribution failure)`);
        }
    });
});
