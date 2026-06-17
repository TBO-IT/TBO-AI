// ─── Test Narrative Generator ─────────────────────────────────────────────────
//
// Sends a FAKE RootCausePack through NarrativeGenerator → Claude Haiku.
//
// No DuckDB. No analytics engines. No SQL generation.
// Purely tests: ClaudeInputPack → Prompt → Claude → Parsed Narrative.
//
// Usage: doppler run -- tsx src/scripts/testNarrative.ts
// ───────────────────────────────────────────────────────────────────────────────

import { ClaudeInputPack } from "../services/claudeInputContract.js";
import { buildNarrativePrompt, generateNarrative } from "../services/narrativeGenerator.js";

// ─── Fake Pack ────────────────────────────────────────────────────────────────

const FAKE_PACK: ClaudeInputPack = {
    question: "why did we lose win rate from april to may",
    metricName: "Win Rate",
    metricChange: {
        direction: "decline",
        currentValue: 53.42,
        priorValue: 58.30,
        absoluteChange: -4.88,
        relativeChangePct: -8.37,
        currentPeriod: "May",
        priorPeriod: "April"
    },
    topPositiveContributors: [
        { name: "Pramana Natura", metricValue: 80.95, volume: 21, volumeSharePct: 1.5, metricDelta: 30.95, weightedContribution: 0.46, contributionPct: 9.5 },
        { name: "Novotel Bangkok", metricValue: 72.00, volume: 50, volumeSharePct: 3.6, metricDelta: 12.00, weightedContribution: 0.43, contributionPct: 8.8 }
    ],
    topNegativeContributors: [
        { name: "Sofitel Bangkok Sukhumvit", metricValue: 45.00, volume: 200, volumeSharePct: 14.3, metricDelta: -15.00, weightedContribution: -2.14, contributionPct: -43.9 },
        { name: "Mercure Pattaya", metricValue: 38.00, volume: 100, volumeSharePct: 7.1, metricDelta: -22.00, weightedContribution: -1.57, contributionPct: -32.2 },
        { name: "ibis Styles Bangkok", metricValue: 50.00, volume: 60, volumeSharePct: 4.3, metricDelta: -8.00, weightedContribution: -0.34, contributionPct: -7.0 }
    ],
    affectedHotels: [
        { name: "Sofitel Bangkok Sukhumvit", metricValue: 45, volume: 200, volumeSharePct: 14.3, metricDelta: -15, weightedContribution: -2.14, contributionPct: -43.9 },
        { name: "Mercure Pattaya", metricValue: 38, volume: 100, volumeSharePct: 7.1, metricDelta: -22, weightedContribution: -1.57, contributionPct: -32.2 }
    ],
    affectedChains: [],
    affectedSuppliers: [
        { name: "Affiliate", metricValue: 52, volume: 500, volumeSharePct: 35.7, metricDelta: -3, weightedContribution: -1.07, contributionPct: -21.9 },
        { name: "Synxis", metricValue: 60, volume: 400, volumeSharePct: 28.6, metricDelta: 2, weightedContribution: 0.57, contributionPct: 11.7 }
    ],
    affectedAPWBuckets: [],
    trendSummary: [],
    contradictionDetected: false,
    validationStatus: "PASSED",
    validationErrors: [],
    totalRows: 1400,
    builtAt: new Date().toISOString()
};

// ─── Run ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  NARRATIVE GENERATOR TEST");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");

    // 1. Show the prompt
    const prompt = buildNarrativePrompt(FAKE_PACK);
    console.log("[PROMPT]");
    console.log("─".repeat(60));
    console.log(prompt);
    console.log("─".repeat(60));
    console.log("");

    // 2. Call Claude
    console.log("[CALLING CLAUDE HAIKU...]");
    console.log("");

    const result = await generateNarrative(FAKE_PACK);

    console.log("[RESULT]");
    console.log("─".repeat(60));
    console.log(`Claude Used:   ${result.claudeUsed}`);
    console.log(`Claude Failed: ${result.claudeFailed}`);
    console.log("");
    console.log("EXECUTIVE SUMMARY:");
    console.log(result.executiveSummary);
    console.log("");

    if (result.keyDrivers.length > 0) {
        console.log("KEY DRIVERS:");
        result.keyDrivers.forEach(d => console.log(`  • ${d}`));
        console.log("");
    }

    if (result.risks.length > 0) {
        console.log("RISKS:");
        result.risks.forEach(r => console.log(`  • ${r}`));
        console.log("");
    }

    console.log("RAW NARRATIVE:");
    console.log(result.rawNarrative);
    console.log("─".repeat(60));

    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  TEST COMPLETE");
    console.log("═══════════════════════════════════════════════════════════");
}

main().catch(console.error);
