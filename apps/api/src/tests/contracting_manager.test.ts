// --- contracting_manager Smoke Test ---
//
// Verifies that contracting_manager is correctly wired as a first-class dimension
// across all integration points, WITHOUT making any network or database calls.
//
// Run with:  tsx src/tests/contracting_manager.test.ts
// -----------------------------------------------------------------------

import assert from "node:assert/strict";
import { buildSemanticLayer } from "../ai/semanticLayer.js";
import { normalizeDimension } from "../ai/questionKnowledge.js";
import { getDimension } from "../ai/dimensionRegistry.js";
import { getDimensionMapping } from "../ai/execution/ExecutionRegistry.js";
import { BUSINESS_KNOWLEDGE } from "../ai/businessKnowledge.js";

// --- Mock schemas ---

const MOCK_SCHEMA_WITH_CM = [
    { column_name: "hotel", column_type: "VARCHAR" },
    { column_name: "chain", column_type: "VARCHAR" },
    { column_name: "suppliername", column_type: "VARCHAR" },
    { column_name: "destination", column_type: "VARCHAR" },
    { column_name: "scraped_date", column_type: "VARCHAR" },
    { column_name: "Competitive Status", column_type: "VARCHAR" },
    { column_name: "price_diff_perc", column_type: "DOUBLE" },
    { column_name: "apw_bucket_new", column_type: "VARCHAR" },
    { column_name: "contracting_manager", column_type: "VARCHAR" }
];

const MOCK_SCHEMA_WITHOUT_CM = [
    { column_name: "hotel", column_type: "VARCHAR" },
    { column_name: "destination", column_type: "VARCHAR" },
    { column_name: "Competitive Status", column_type: "VARCHAR" },
    { column_name: "price_diff_perc", column_type: "DOUBLE" },
];

// --- Test runner ---

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
    try {
        fn();
        console.log(`PASS: ${name}`);
        passed++;
    } catch (err: any) {
        console.log(`FAIL: ${name}\n   -> ${err.message}`);
        failed++;
    }
}

console.log("=== contracting_manager Smoke Tests ===\n");

// 1. Semantic Layer Detection

test("Semantic layer detects contracting_manager when column is present", () => {
    const sl = buildSemanticLayer(MOCK_SCHEMA_WITH_CM);
    assert.ok(
        sl.dimensions.includes("contracting_manager"),
        `Expected 'contracting_manager' in dimensions, got: [${sl.dimensions.join(", ")}]`
    );
});

test("Semantic layer maps contracting_manager column to canonical key", () => {
    const sl = buildSemanticLayer(MOCK_SCHEMA_WITH_CM);
    assert.equal(
        sl.columnMappings["contracting_manager"],
        "contracting_manager"
    );
});

test("Semantic layer does NOT include contracting_manager when column is absent", () => {
    const sl = buildSemanticLayer(MOCK_SCHEMA_WITHOUT_CM);
    assert.ok(
        !sl.dimensions.includes("contracting_manager"),
        "contracting_manager should not appear in dimensions when absent"
    );
});

// 2. NLP Synonym Normalization

const synonyms = [
    "contracting manager",
    "contracting managers",
    "contract manager",
    "contract managers",
    "hotel manager",
    "hotel managers",
    "account manager",
    "account managers",
    "contracting lead",
    "contracting leads",
    "manager"
];

for (const synonym of synonyms) {
    test(`normalizeDimension("${synonym}") -> "contracting_manager"`, () => {
        const result = normalizeDimension(synonym);
        assert.equal(result, "contracting_manager", `Got '${result}'`);
    });
}

// 3. Dimension Registry

test("getDimension('contracting_manager') returns valid DimensionDefinition", () => {
    const def = getDimension("contracting_manager");
    assert.ok(def !== null, "Should return a definition, not null");
    assert.equal(def!.canonicalKey, "contracting_manager");
    assert.equal(def!.label, "Contracting Manager");
    assert.equal(def!.filterType, "ilike");
});

// 4. Execution Registry

test("getDimensionMapping('contracting_manager') returns correct physical columns", () => {
    const mapping = getDimensionMapping("contracting_manager");
    assert.ok(mapping !== null, "Should return a mapping, not null");
    assert.ok(mapping!.physicalColumns.includes("contracting_manager"));
    assert.equal(mapping!.filterType, "ilike");
});

// 5. Business Knowledge

test("BUSINESS_KNOWLEDGE.concepts includes contracting_manager with a description", () => {
    const concept = (BUSINESS_KNOWLEDGE.concepts as Record<string, { description: string }>)["contracting_manager"];
    assert.ok(concept, "Should exist in BUSINESS_KNOWLEDGE.concepts");
    assert.ok(concept.description.length > 0, "Description should not be empty");
    assert.ok(concept.description.toLowerCase().includes("contracting"));
});

// --- Summary ---

console.log(`\n=== Test Summary ===\nPassed: ${passed}\nFailed: ${failed}\n`);

if (failed > 0) {
    process.exit(1);
}
