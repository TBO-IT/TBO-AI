// ─── Test Narrative Generator ─────────────────────────────────────────────────
//
// Sends a FAKE RootCausePack through NarrativeGenerator → Claude Haiku.
//
// No DuckDB. No analytics engines. No SQL generation.
// Purely tests: ClaudeInputPack → Prompt → Claude → Parsed Narrative.
//
// Usage: doppler run -- tsx src/scripts/testNarrative.ts
// ───────────────────────────────────────────────────────────────────────────────
import { buildSemanticLayer } from "../ai/semanticLayer.js";
import { buildRootCausePack } from "../services/RootCausePackBuilder.js";
import { buildExecutivePack } from "../services/insights/executivePackBuilder.js";
import { buildClaudeInputPack } from "../services/claudeInputContract.js";
import { buildNarrativePrompt, generateNarrative } from "../services/narrativeGenerator.js";
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
const mockResults = [[
        { "Hotel": "Pramana Natura", "Volume": 21, "Volume Share %": 1.5, "Win Rate": 80.95, "Metric Delta": 30.95, "Weighted Contribution": 0.46, "Contribution %": 9.5, "Overall Metric Change": -4.88 },
        { "Hotel": "Novotel Bangkok", "Volume": 50, "Volume Share %": 3.6, "Win Rate": 72.00, "Metric Delta": 12.00, "Weighted Contribution": 0.43, "Contribution %": 8.8, "Overall Metric Change": -4.88 },
        { "Hotel": "Sofitel Bangkok Sukhumvit", "Volume": 200, "Volume Share %": 14.3, "Win Rate": 45.00, "Metric Delta": -15.00, "Weighted Contribution": -2.14, "Contribution %": -43.9, "Overall Metric Change": -4.88 },
        { "Hotel": "Mercure Pattaya", "Volume": 100, "Volume Share %": 7.1, "Win Rate": 38.00, "Metric Delta": -22.00, "Weighted Contribution": -1.57, "Contribution %": -32.2, "Overall Metric Change": -4.88 }
    ]];
const sl = buildSemanticLayer(MOCK_SCHEMA);
const rootPack = buildRootCausePack("why did we lose win rate from april to may", sl, mockResults);
const execPack = buildExecutivePack(rootPack);
const FAKE_PACK = buildClaudeInputPack("why did we lose win rate from april to may", rootPack, execPack);
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
