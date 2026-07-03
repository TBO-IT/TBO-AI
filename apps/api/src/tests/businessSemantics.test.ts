// ─── Business Semantics Normalization Tests ───────────────────────────────────
//
// Verifies that absolute gap queries normalize correctly depending on status.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeQuestion } from "../ai/questionAnalyzer.js";
import { generateTemplatedSql } from "../ai/sqlTemplateEngine.js";
import { EnrichedSemanticLayer } from "../ai/semanticLayer.js";
import { DatasetType } from "../ai/datasetTypes.js";

// Mock semantic layer
const mockSemanticLayer: EnrichedSemanticLayer = {
    datasetType: DatasetType.COMPETITIVENESS,
    dimensions: ["hotel", "destination", "competitive_status"],
    metricKeys: ["win_rate", "avg_price_diff"],
    primaryTimeDimension: "scraped_date",
    availableTimeColumns: ["scraped_date"],
    columnMappings: {
        "tbo_hotelname": "hotel",
        "destination": "destination",
        "Competitive Status": "competitive_status"
    },
    businessDefinitions: [],
    metrics: [
        { name: "Win Rate", description: "Win rate", formula: 'AVG(CASE WHEN "Competitive Status" = \'Winning\' THEN 1.0 ELSE 0.0 END) * 100.0' },
        { name: "avg_price_diff", description: "Price gap", formula: "AVG(CAST(price_diff_perc AS DOUBLE))" }
    ],
    allColumns: [
        { column_name: "tbo_hotelname", column_type: "VARCHAR" },
        { column_name: "destination", column_type: "VARCHAR" },
        { column_name: "Competitive Status", column_type: "VARCHAR" },
        { column_name: "price_diff_perc", column_type: "DOUBLE" },
        { column_name: "scraped_date", column_type: "VARCHAR" }
    ]
};

describe("Business Semantics Normalization Layer", () => {

    it("normalizes: Losing gap between 1–3%", () => {
        // "Show hotels in Phuket where we are losing pricing gap between 1% and 3%"
        const question = "Show hotels in Phuket where we are losing pricing gap between 1% and 3%";
        const analysis = analyzeQuestion(question);

        // Find status filter
        const statusFilter = analysis.filters.find(f => f.dimension === "competitive_status");
        assert.ok(statusFilter);
        assert.equal(statusFilter.value, "Losing");

        // Find normalized pricing gap filter
        const priceFilter = analysis.filters.find(f => f.dimension === "avg_price_diff");
        assert.ok(priceFilter);
        assert.equal(priceFilter.operator, "BETWEEN");
        assert.equal(priceFilter.value, "-3 AND -1");

        // Generate SQL and verify WHERE clause
        const sql = generateTemplatedSql(analysis, mockSemanticLayer);
        assert.ok(sql);
        assert.ok(sql.includes('"price_diff_perc" BETWEEN -3 AND -1'));
    });

    it("normalizes: Winning gap between 1–3%", () => {
        // "Show hotels in Phuket where we are winning pricing gap between 1% and 3%"
        const question = "Show hotels in Phuket where we are winning pricing gap between 1% and 3%";
        const analysis = analyzeQuestion(question);

        // Find status filter
        const statusFilter = analysis.filters.find(f => f.dimension === "competitive_status");
        assert.ok(statusFilter);
        assert.equal(statusFilter.value, "Winning");

        // Find normalized pricing gap filter
        const priceFilter = analysis.filters.find(f => f.dimension === "avg_price_diff");
        assert.ok(priceFilter);
        assert.equal(priceFilter.operator, "BETWEEN");
        assert.equal(priceFilter.value, "1 AND 3");

        // Generate SQL and verify WHERE clause
        const sql = generateTemplatedSql(analysis, mockSemanticLayer);
        assert.ok(sql);
        assert.ok(sql.includes('"price_diff_perc" BETWEEN 1 AND 3'));
    });

    it("normalizes: Losing gap greater than 5%", () => {
        // "hotels where we are losing pricing gap greater than 5%"
        const question = "hotels where we are losing pricing gap greater than 5%";
        const analysis = analyzeQuestion(question);

        // Find normalized pricing gap filter: operator is flipped to "<", value negated to "-5"
        const priceFilter = analysis.filters.find(f => f.dimension === "avg_price_diff");
        assert.ok(priceFilter);
        assert.equal(priceFilter.operator, "<");
        assert.equal(priceFilter.value, -5);

        const sql = generateTemplatedSql(analysis, mockSemanticLayer);
        assert.ok(sql);
        assert.ok(sql.includes('"price_diff_perc" < -5'));
    });

    it("normalizes: Winning gap greater than 5%", () => {
        // "hotels where we are winning pricing gap greater than 5%"
        const question = "hotels where we are winning pricing gap greater than 5%";
        const analysis = analyzeQuestion(question);

        const priceFilter = analysis.filters.find(f => f.dimension === "avg_price_diff");
        assert.ok(priceFilter);
        assert.equal(priceFilter.operator, ">");
        assert.equal(priceFilter.value, 5);

        const sql = generateTemplatedSql(analysis, mockSemanticLayer);
        assert.ok(sql);
        assert.ok(sql.includes('"price_diff_perc" > 5'));
    });

    it("normalizes: Unspecified status gap between 1-3%", () => {
        // "hotels with pricing gap between 1% and 3%"
        const question = "hotels with pricing gap between 1% and 3%";
        const analysis = analyzeQuestion(question);

        // Should prefix with "abs_"
        const priceFilter = analysis.filters.find(f => f.dimension === "abs_avg_price_diff");
        assert.ok(priceFilter);
        assert.equal(priceFilter.operator, "BETWEEN");
        assert.equal(priceFilter.value, "1 AND 3");

        const sql = generateTemplatedSql(analysis, mockSemanticLayer);
        assert.ok(sql);
        assert.ok(sql.includes('ABS("price_diff_perc") BETWEEN 1 AND 3'));
    });
});
