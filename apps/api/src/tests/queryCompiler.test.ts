// ─── QueryCompiler Unit Tests (Sprint 2) ──────────────────────────────────────
//
// Pure unit tests verifying all Sprint 2 Query Compiler capabilities.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeQuestion } from "../ai/questionAnalyzer.js";
import { routeQuery } from "../ai/queryRouter.js";
import { generateTemplatedSql } from "../ai/sqlTemplateEngine.js";
import { EnrichedSemanticLayer } from "../ai/semanticLayer.js";
import { DatasetType } from "../ai/datasetTypes.js";

// Mock semantic layers for COMPETITIVENESS and CONVERSION
const mockCompetitivenessLayer: EnrichedSemanticLayer = {
    datasetType: DatasetType.COMPETITIVENESS,
    dimensions: ["hotel", "supplier", "chain", "destination", "competitive_status", "apw"],
    metricKeys: ["win_rate", "avg_price_diff", "median_price_diff"],
    primaryTimeDimension: "scraped_date",
    availableTimeColumns: ["scraped_date"],
    columnMappings: {
        "tbo_hotelname": "hotel",
        "suppliername": "supplier",
        "tbo_chainname": "chain",
        "destination": "destination",
        "Competitive Status": "competitive_status",
        "apw_bucket_new": "apw"
    },
    businessDefinitions: [],
    metrics: [
        { name: "Win Rate", description: "Win rate", formula: 'AVG(CASE WHEN "Competitive Status" = \'Winning\' THEN 1.0 ELSE 0.0 END) * 100.0' },
        { name: "avg_price_diff", description: "Price gap", formula: "AVG(CAST(price_diff_perc AS DOUBLE))" }
    ],
    allColumns: [
        { column_name: "tbo_hotelname", column_type: "VARCHAR" },
        { column_name: "suppliername", column_type: "VARCHAR" },
        { column_name: "tbo_chainname", column_type: "VARCHAR" },
        { column_name: "destination", column_type: "VARCHAR" },
        { column_name: "Competitive Status", column_type: "VARCHAR" },
        { column_name: "apw_bucket_new", column_type: "VARCHAR" },
        { column_name: "price_diff_perc", column_type: "DOUBLE" },
        { column_name: "tbo_price", column_type: "DOUBLE" },
        { column_name: "thirdparty_price", column_type: "DOUBLE" },
        { column_name: "scraped_date", column_type: "VARCHAR" }
    ]
};

const mockConversionLayer: EnrichedSemanticLayer = {
    datasetType: DatasetType.CONVERSION,
    dimensions: ["hotel", "city"],
    metricKeys: ["searches", "bookings", "l2b"],
    primaryTimeDimension: "scraped_date",
    availableTimeColumns: ["scraped_date"],
    columnMappings: {
        "Hotel name": "hotel",
        "City": "city"
    },
    businessDefinitions: [],
    metrics: [
        { name: "Searches", description: "Searches", formula: "SUM(Searches)" },
        { name: "Bookings", description: "Bookings", formula: "SUM(Bookings)" },
        { name: "L2B Rate", description: "L2B%", formula: "(SUM(Bookings)/SUM(Searches))*100.0" }
    ],
    allColumns: [
        { column_name: "Hotel name", column_type: "VARCHAR" },
        { column_name: "City", column_type: "VARCHAR" },
        { column_name: "Searches", column_type: "BIGINT" },
        { column_name: "Bookings", column_type: "BIGINT" },
        { column_name: "L2B%", column_type: "DOUBLE" },
        { column_name: "scraped_date", column_type: "VARCHAR" }
    ]
};

describe("QueryCompiler Sprint 2 Capabilities", () => {

    // ─── 1. LIST Intent Classification ────────────────────────────────────────
    describe("LIST Intent Classification", () => {
        const listQueries = [
            "Show hotels in Phuket",
            "List suppliers in London",
            "Display losing hotels",
            "Give me chains performing well",
            "fetch hotels in tokyo"
        ];

        for (const q of listQueries) {
            it(`classifies '${q}' as LIST intent`, () => {
                const analysis = analyzeQuestion(q);
                assert.equal(analysis.intent, "LIST");
            });
        }

        it("does NOT classify aggregate queries as LIST", () => {
            const q = "show average pricing gap";
            const analysis = analyzeQuestion(q);
            assert.equal(analysis.intent, "SUMMARY");
        });
    });

    // ─── 2. Focus Column Selection ────────────────────────────────────────────
    describe("Focus Column Selection (Row-level SQL)", () => {
        it("selects hotel focus columns for competitiveness", () => {
            const analysis = analyzeQuestion("Show hotels in Phuket");
            assert.equal(analysis.focus, "hotel");

            const sql = generateTemplatedSql(analysis, mockCompetitivenessLayer);
            assert.ok(sql);
            assert.ok(sql.includes("tbo_hotelname"));
            assert.ok(sql.includes("destination"));
            assert.ok(sql.includes("price_diff_perc"));
            assert.ok(sql.includes("Competitive Status"));
            assert.ok(sql.includes("tbo_price"));
            assert.ok(sql.includes("thirdparty_price"));
            assert.ok(!sql.includes("GROUP BY")); // LIST is row-level, no GROUP BY
        });

        it("selects supplier focus columns for competitiveness", () => {
            const analysis = analyzeQuestion("List suppliers");
            assert.equal(analysis.focus, "supplier");

            const sql = generateTemplatedSql(analysis, mockCompetitivenessLayer);
            assert.ok(sql);
            assert.ok(sql.includes("suppliername"));
            assert.ok(sql.includes("destination"));
            assert.ok(sql.includes("price_diff_perc"));
            assert.ok(!sql.includes("tbo_hotelname"));
        });
    });

    // ─── 3. BETWEEN Operator support ──────────────────────────────────────────
    describe("BETWEEN Operator Support", () => {
        it("compiles price gap between 1 and 3 into BETWEEN clause", () => {
            const analysis = analyzeQuestion("Show hotels in Phuket where price gap is between 1 and 3");
            const filter = analysis.filters.find(f => f.dimension === "abs_avg_price_diff");
            assert.ok(filter);
            assert.equal(filter.operator, "BETWEEN");
            assert.equal(filter.value, "1 AND 3");

            const sql = generateTemplatedSql(analysis, mockCompetitivenessLayer);
            assert.ok(sql);
            assert.ok(sql.includes('ABS("price_diff_perc") BETWEEN 1 AND 3'));
        });
    });

    // ─── 4. Metric Filter Resolution ──────────────────────────────────────────
    describe("Metric Filter Resolution", () => {
        it("resolves pricing gap metric filter to physical price_diff_perc column", () => {
            const analysis = analyzeQuestion("hotels with pricing gap greater than 5%");
            const filter = analysis.filters.find(f => f.dimension === "abs_avg_price_diff");
            assert.ok(filter);
            assert.equal(filter.operator, ">");
            assert.equal(filter.value, 5);

            const sql = generateTemplatedSql(analysis, mockCompetitivenessLayer);
            assert.ok(sql);
            assert.ok(sql.includes('ABS("price_diff_perc") > 5'));
        });
    });

    // ─── 5. Multiple Entity IN Clause support ─────────────────────────────────
    describe("Multiple Entity IN Clause Support", () => {
        it("combines multiple destination filters into a single IN clause", () => {
            // Mocking the behavior where destination filters have been resolved
            const analysis = {
                metrics: ["win_rate"],
                dimensions: ["hotel"],
                filters: [
                    { dimension: "destination", operator: "=" as const, value: "London" },
                    { dimension: "destination", operator: "=" as const, value: "Phuket" }
                ],
                timeReferences: [],
                intent: "LIST" as const,
                originalQuestion: "Show hotels in London and Phuket",
                focus: "hotel"
            };

            const sql = generateTemplatedSql(analysis, mockCompetitivenessLayer);
            assert.ok(sql);
            assert.ok(sql.includes(`"destination" IN ('London', 'Phuket')`));
            assert.ok(!sql.includes(`"destination" = 'London' AND "destination" = 'Phuket'`));
        });
    });

    // ─── 6. Dynamic Ranking Limit & Direction ─────────────────────────────────
    describe("Dynamic Ranking Limit and Direction", () => {
        it("compiles Bottom 20 destinations by win rate to ASC limit 20", () => {
            const analysis = analyzeQuestion("Bottom 20 destinations by win rate");
            assert.equal(analysis.intent, "RANKING");

            const sql = generateTemplatedSql(analysis, mockCompetitivenessLayer);
            assert.ok(sql);
            assert.ok(sql.includes('ORDER BY "Win Rate" ASC'));
            assert.ok(sql.includes('LIMIT 20'));
        });

        it("compiles Top 5 suppliers to DESC limit 5", () => {
            const analysis = analyzeQuestion("Top 5 suppliers by win rate");
            assert.equal(analysis.intent, "RANKING");

            const sql = generateTemplatedSql(analysis, mockCompetitivenessLayer);
            assert.ok(sql);
            assert.ok(sql.includes('ORDER BY "Win Rate" DESC'));
            assert.ok(sql.includes('LIMIT 5'));
        });
    });
});
