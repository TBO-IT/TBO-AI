// ─── Test Claude Connection ───────────────────────────────────────────────────
//
// Verifies that the Anthropic API key is valid and both models respond.
//
// Usage: doppler run -- tsx src/scripts/testClaudeConnection.ts
// ───────────────────────────────────────────────────────────────────────────────
import { MODELS } from "../config/models.js";
import { generateText } from "../services/anthropicClient.js";
async function main() {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  CLAUDE CONNECTION TEST");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");
    // Check env vars
    console.log("[CONFIG]");
    console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "✅ SET" : "❌ MISSING"}`);
    console.log(`  CLAUDE_HAIKU_MODEL:  ${MODELS.HAIKU ?? "❌ NOT SET"}`);
    console.log(`  CLAUDE_SONNET_MODEL: ${MODELS.SONNET ?? "❌ NOT SET"}`);
    console.log("");
    if (!process.env.ANTHROPIC_API_KEY) {
        console.error("❌ ANTHROPIC_API_KEY is not set. Cannot test connection.");
        process.exit(1);
    }
    // Test Haiku
    if (MODELS.HAIKU) {
        console.log("[HAIKU] Testing...");
        try {
            const result = await generateText("Reply with exactly: HAIKU_OK", "Reply with the exact text requested.", "HAIKU", 20, 0);
            console.log(`  ✅ Response: "${result.text.trim()}"`);
            console.log(`  Tokens: ${result.inputTokens} in / ${result.outputTokens} out`);
            console.log(`  Latency: ${result.latencyMs}ms`);
            console.log(`  Cost: $${result.estimatedCost.toFixed(6)}`);
        }
        catch (err) {
            console.error(`  ❌ FAILED: ${err.message}`);
        }
        console.log("");
    }
    // Test Sonnet
    if (MODELS.SONNET) {
        console.log("[SONNET] Testing...");
        try {
            const result = await generateText("Reply with exactly: SONNET_OK", "Reply with the exact text requested.", "SONNET", 20, 0);
            console.log(`  ✅ Response: "${result.text.trim()}"`);
            console.log(`  Tokens: ${result.inputTokens} in / ${result.outputTokens} out`);
            console.log(`  Latency: ${result.latencyMs}ms`);
            console.log(`  Cost: $${result.estimatedCost.toFixed(6)}`);
        }
        catch (err) {
            console.error(`  ❌ FAILED: ${err.message}`);
        }
        console.log("");
    }
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  CONNECTION TEST COMPLETE");
    console.log("═══════════════════════════════════════════════════════════");
}
main().catch(console.error);
