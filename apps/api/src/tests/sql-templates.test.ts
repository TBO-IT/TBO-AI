import { globalClassifier } from "../sql-templates/classifier.js";
import { templates } from "../sql-templates/templates.js";
import { globalSlotResolver } from "../sql-templates/slot-resolver.js";
import { DatasetMetadata } from "../services/metadataService.js";

// Register templates
templates.forEach(t => globalClassifier.register(t));

const mockMetadata: DatasetMetadata = {
    destinations: ["Bali", "Bangkok", "London", "Dubai", "Pattaya"],
    chains: ["Marriott", "IHG", "Accor"],
    thirdParties: ["Otilla", "Tripjack"],
    hotels: [],
    suppliers: [],
    countries: [],
    apwBuckets: []
};

globalSlotResolver.updateMetadata(mockMetadata);

// Test Positive Matches
const positiveTests = [
    { query: "what's our win rate in bali", expected: "t02_win_rate_destination" },
    { query: "please show me the average price difference in dubai", expected: "t09_avg_price_diff" },
    { query: "how many hotels were scraped in london", expected: "t16_total_hotels_scraped" },
    { query: "break down performance by apw in bangkok", expected: "t21_performance_apw" },
    { query: "top 10 hotels where we are losing in pattaya", expected: "t11_top_hotels_price_gap" }
];

// Test Negative / Adversarial Matches (Should Reject)
const adversarialTests = [
    // Contains "why"
    "why is our win rate in bali dropping",
    // Compound question
    "what's our win rate in bali and compare it to dubai",
    // Negation / Exclusion
    "what's our win rate in bali excluding marriott",
    // Unresolved Slot (fuzzy score < 85%)
    "what's our win rate in nowhereville",
    // Complex recommendation
    "what should we do about our win rate in bali",
    // Leftovers check (query matches pattern but has extra trailing context)
    "what's our win rate in bali for 5 star hotels only"
];

console.log("=== Running SQL Template Engine Tests ===\n");

let passed = 0;
let failed = 0;

console.log("--- Positive Match Tests ---");
for (const test of positiveTests) {
    const res = globalClassifier.classify(test.query);
    if (res.matched && res.template_id === test.expected) {
        // Test resolution
        const { lowestConfidence, failedSlot } = globalSlotResolver.resolveAll(res.slots || {});
        if (lowestConfidence >= 0.85) {
            console.log(`✅ PASS: "${test.query}" -> ${test.expected}`);
            passed++;
        } else {
            console.log(`❌ FAIL: "${test.query}" -> Slot resolution failed for ${failedSlot}`);
            failed++;
        }
    } else {
        console.log(`❌ FAIL: "${test.query}" -> Expected ${test.expected}, got ${res.matched ? res.template_id : "No Match"}`);
        failed++;
    }
}

console.log("\n--- Adversarial (Negative) Tests ---");
for (const query of adversarialTests) {
    const res = globalClassifier.classify(query);
    
    if (!res.matched) {
        console.log(`✅ PASS (Rejected): "${query}" -> Reason: ${res.reason}`);
        passed++;
    } else {
        // If matched, verify slot resolution rejects it
        const { lowestConfidence } = globalSlotResolver.resolveAll(res.slots || {});
        if (lowestConfidence < 0.85) {
            console.log(`✅ PASS (Rejected by Slot): "${query}" -> Slot confidence ${lowestConfidence}`);
            passed++;
        } else {
            console.log(`❌ FAIL (Should Reject!): "${query}" -> Incorrectly matched template ${res.template_id}`);
            failed++;
        }
    }
}

console.log(`\n=== Test Summary ===\nPassed: ${passed}\nFailed: ${failed}`);

if (failed > 0) {
    process.exit(1);
}
