// ─── Entity Resolution Fix Regression Tests ──────────────────────────────────
//
// Verifies that unclassified '_entity' filters are resolved to canonical dimensions
// and compile to IN clauses without leaking '_entity' to the SQL generator.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeQuestion } from "../ai/questionAnalyzer.js";
import { generateComparisonSql } from "../services/comparisonEngine.js";
import { EnrichedSemanticLayer } from "../ai/semanticLayer.js";
import { DatasetType } from "../ai/datasetTypes.js";

// Mock semantic layer for competitiveness
const mockSemanticLayer: EnrichedSemanticLayer = {
    datasetType: DatasetType.COMPETITIVENESS,
    dimensions: ["hotel", "destination", "supplier", "chain"],
    metricKeys: ["win_rate"],
    primaryTimeDimension: "scraped_date",
    availableTimeColumns: ["scraped_date"],
    columnMappings: {
        "tbo_hotelname": "hotel",
        "destination": "destination",
        "suppliername": "supplier",
        "tbo_chainname": "chain"
    },
    businessDefinitions: [],
    metrics: [
        { name: "Win Rate", description: "Win rate", formula: 'AVG(CASE WHEN "Competitive Status" = \'Winning\' THEN 1.0 ELSE 0.0 END) * 100.0' }
    ],
    allColumns: [
        { column_name: "tbo_hotelname", column_type: "VARCHAR" },
        { column_name: "destination", column_type: "VARCHAR" },
        { column_name: "suppliername", column_type: "VARCHAR" },
        { column_name: "tbo_chainname", column_type: "VARCHAR" },
        { column_name: "scraped_date", column_type: "VARCHAR" }
    ]
};

describe("Entity Resolution Fix Integration", () => {

    it("resolves: Compare Marriott and Hilton in London", () => {
        const question = "Compare Marriott and Hilton in London";
        const analysis = analyzeQuestion(question);

        // Simulate Orchestrator merging metadata resolved filters with parser parsed filters
        analysis.filters = [
            { dimension: "_entity", operator: "ILIKE", value: "Marriott" },
            { dimension: "_entity", operator: "ILIKE", value: "Hilton" },
            { dimension: "_entity", operator: "ILIKE", value: "London" },
            { dimension: "chain", operator: "=" as const, value: "Marriott" },
            { dimension: "chain", operator: "=" as const, value: "Hilton" },
            { dimension: "destination", operator: "=" as const, value: "London" }
        ];

        // Run SQL comparison generation
        const comparison = generateComparisonSql(analysis, mockSemanticLayer);
        assert.ok(comparison);
        const sql = comparison.sql;

        // Verify that NO '_entity' filter or fallback reached the output SQL
        assert.equal(sql.includes("_entity"), false);

        // Verify canonical grouping and filtering
        assert.ok(
            sql.includes('"tbo_chainname" IN (\'Marriott\', \'Hilton\')') ||
            sql.includes('"tbo_chainname" IN (\'Hilton\', \'Marriott\')')
        );
        assert.ok(sql.includes('"destination" ILIKE'));
    });

    it("resolves: Compare London and Bangkok", () => {
        const question = "Compare London and Bangkok";
        const analysis = analyzeQuestion(question);

        // Simulate London resolved canonical, Bangkok unresolved proper noun
        analysis.filters = [
            { dimension: "_entity", operator: "ILIKE", value: "London" },
            { dimension: "_entity", operator: "ILIKE", value: "Bangkok" },
            { dimension: "destination", operator: "=" as const, value: "London" }
        ];

        const comparison = generateComparisonSql(analysis, mockSemanticLayer);
        assert.ok(comparison);
        const sql = comparison.sql;

        // Verify that NO '_entity' filter reached the output SQL
        assert.equal(sql.includes("_entity"), false);

        // Verify destination IN clause
        assert.ok(
            sql.includes('"destination" IN (\'London\', \'Bangkok\')') ||
            sql.includes('"destination" IN (\'Bangkok\', \'London\')')
        );
    });

    it("resolves: Compare Supplier A and Supplier B", () => {
        const question = "Compare Supplier A and Supplier B";
        const analysis = analyzeQuestion(question);

        // Simulate both unresolved proper nouns, focus is supplier
        analysis.filters = [
            { dimension: "_entity", operator: "ILIKE", value: "Supplier A" },
            { dimension: "_entity", operator: "ILIKE", value: "Supplier B" }
        ];

        const comparison = generateComparisonSql(analysis, mockSemanticLayer);
        assert.ok(comparison);
        const sql = comparison.sql;

        // Verify that NO '_entity' filter reached the output SQL
        assert.equal(sql.includes("_entity"), false);

        // Verify supplier IN clause
        assert.ok(
            sql.includes('"suppliername" IN (\'Supplier A\', \'Supplier B\')') ||
            sql.includes('"suppliername" IN (\'Supplier B\', \'Supplier A\')')
        );
    });
});
