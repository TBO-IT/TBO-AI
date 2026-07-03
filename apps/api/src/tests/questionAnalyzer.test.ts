// ─── QuestionAnalyzer Unit Tests (Sprint 1) ───────────────────────────────────
//
// Pure unit tests verifying all new NLP parsing capabilities in QuestionAnalyzer.
// No DB or network connections required.
// ───────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeQuestion } from "../ai/questionAnalyzer.js";

describe("QuestionAnalyzer Sprint 1 NLP Capabilities", () => {

    // ─── 1. Range Filters ─────────────────────────────────────────────────────
    describe("Range Filters", () => {
        it("parses 'between 10 and 20' into BETWEEN operator", () => {
            const analysis = analyzeQuestion("apw between 10 and 20");
            const apwFilters = analysis.filters.filter(f => f.dimension === "apw");
            assert.equal(apwFilters.length, 1);
            assert.equal(apwFilters[0].operator, "BETWEEN");
            assert.equal(apwFilters[0].value, "10 AND 20");
        });

        it("parses '10 to 20' into BETWEEN operator", () => {
            const analysis = analyzeQuestion("win rate where apw is 10 to 20");
            const apwFilters = analysis.filters.filter(f => f.dimension === "apw");
            assert.equal(apwFilters.length, 1);
            assert.equal(apwFilters[0].operator, "BETWEEN");
            assert.equal(apwFilters[0].value, "10 AND 20");
        });

        it("parses 'greater than' and 'above' and '>'", () => {
            const a1 = analyzeQuestion("lead time greater than 5");
            const f1 = a1.filters.find(f => f.dimension === "apw");
            assert.ok(f1);
            assert.equal(f1.operator, ">");
            assert.equal(f1.value, 5);

            const a2 = analyzeQuestion("win rate above 65");
            const f2 = a2.filters.find(f => f.dimension === "win_rate");
            assert.ok(f2);
            assert.equal(f2.operator, ">");
            assert.equal(f2.value, 65);
        });

        it("parses 'less than' and 'below' and '<'", () => {
            const a1 = analyzeQuestion("lead time less than 15");
            const f1 = a1.filters.find(f => f.dimension === "apw");
            assert.ok(f1);
            assert.equal(f1.operator, "<");
            assert.equal(f1.value, 15);

            const a2 = analyzeQuestion("win rate below 40.5");
            const f2 = a2.filters.find(f => f.dimension === "win_rate");
            assert.ok(f2);
            assert.equal(f2.operator, "<");
            assert.equal(f2.value, 40.5);
        });

        it("parses >= and <= operators", () => {
            const a1 = analyzeQuestion("apw >= 30");
            const f1 = a1.filters.find(f => f.dimension === "apw");
            assert.ok(f1);
            assert.equal(f1.operator, ">=");
            assert.equal(f1.value, 30);

            const a2 = analyzeQuestion("apw <= 45");
            const f2 = a2.filters.find(f => f.dimension === "apw");
            assert.ok(f2);
            assert.equal(f2.operator, "<=");
            assert.equal(f2.value, 45);
        });
    });

    // ─── 2. Ranking Keywords ──────────────────────────────────────────────────
    describe("Ranking Keywords", () => {
        const rankingKeywords = ["top", "bottom", "highest", "lowest", "best", "worst"];
        
        for (const word of rankingKeywords) {
            it(`detects RANKING intent for phrase containing '${word}'`, () => {
                const analysis = analyzeQuestion(`what are the ${word} performing hotels`);
                assert.equal(analysis.intent, "RANKING");
            });
        }
    });

    // ─── 3. List Queries ──────────────────────────────────────────────────────
    describe("List Queries", () => {
        const listKeywords = ["show", "list", "display", "give me"];

        for (const word of listKeywords) {
            it(`detects LIST intent for queries beginning with or containing '${word}'`, () => {
                const analysis = analyzeQuestion(`${word} all hotels`);
                assert.equal(analysis.intent, "LIST");
            });
        }
    });

    // ─── 4. Multiple Entities ─────────────────────────────────────────────────
    describe("Multiple Entities (Lists & Lowercase)", () => {
        it("extracts multiple capitalized entities", () => {
            const analysis = analyzeQuestion("Compare Marriott and Hilton");
            const entities = analysis.filters.filter(f => f.dimension === "_entity").map(f => f.value);
            assert.equal(entities.length, 2);
            assert.ok(entities.includes("Marriott"));
            assert.ok(entities.includes("Hilton"));
        });

        it("extracts multiple lowercase entities separated by commas and conjunctions", () => {
            const analysis = analyzeQuestion("compare london, paris and phuket");
            const entities = analysis.filters.filter(f => f.dimension === "_entity").map(f => String(f.value).toLowerCase());
            assert.equal(entities.length, 3);
            assert.ok(entities.includes("london"));
            assert.ok(entities.includes("paris"));
            assert.ok(entities.includes("phuket"));
        });

        it("extracts lowercase competitor entities separated by 'vs'", () => {
            const analysis = analyzeQuestion("compare affiliate vs synxis");
            const entities = analysis.filters.filter(f => f.dimension === "_entity").map(f => String(f.value).toLowerCase());
            assert.equal(entities.length, 2);
            assert.ok(entities.includes("affiliate"));
            assert.ok(entities.includes("synxis"));
        });
    });

    // ─── 5. Relative Time ─────────────────────────────────────────────────────
    describe("Relative Time", () => {
        const timeSignals = ["wow", "mom", "this week", "last week", "last month", "month-over-month", "past month"];

        for (const sig of timeSignals) {
            it(`extracts '${sig}' as a time reference`, () => {
                const analysis = analyzeQuestion(`what was win rate trend ${sig}`);
                assert.ok(analysis.timeReferences.some(t => t.toLowerCase() === sig.toLowerCase()));
            });
        }
    });

    // ─── 6. Business Metrics Synonyms ─────────────────────────────────────────
    describe("Business Metrics Synonyms", () => {
        it("maps competitiveness to win_rate", () => {
            const analysis = analyzeQuestion("what is our competitiveness by supplier");
            assert.ok(analysis.metrics.includes("win_rate"));
        });

        it("maps pricing gap, markup, and margins to avg_price_diff", () => {
            const metrics = [
                "pricing gap",
                "markup",
                "winning margin",
                "losing margin"
            ];
            for (const text of metrics) {
                const analysis = analyzeQuestion(`what is the ${text} for hilton`);
                assert.ok(analysis.metrics.includes("avg_price_diff"), `Failed on: ${text}`);
            }
        });

        it("maps volume share to bookings", () => {
            const analysis = analyzeQuestion("what is volume share by country");
            assert.ok(analysis.metrics.includes("bookings"));
        });
    });

    // ─── 7. Business Focus Extraction ─────────────────────────────────────────
    describe("Business Focus Extraction", () => {
        const focusCases = [
            { query: "which hotel has lowest win rate", expectedFocus: "hotel" },
            { query: "show supplier competitiveness", expectedFocus: "supplier" },
            { query: "list hotel chains performing well", expectedFocus: "chain" },
            { query: "which destinations should I focus on", expectedFocus: "destination" },
            { query: "which competitor is hurting us most", expectedFocus: "competitor" },
            { query: "show lead time distribution", expectedFocus: "apw" },
            { query: "compare Marriott and Hilton", expectedFocus: "chain" },
            { query: "show win rate in London", expectedFocus: "destination" }
        ];

        for (const tc of focusCases) {
            it(`detects focus='${tc.expectedFocus}' for query '${tc.query}'`, () => {
                const analysis = analyzeQuestion(tc.query);
                assert.equal(analysis.focus, tc.expectedFocus);
            });
        }
    });
});

// ─── Status / Entity Separation Regression Tests ──────────────────────────────
//
// Verifies that questions like "Why is Bangkok losing?" produce:
//   destination = "Bangkok"  AND  competitive_status = "Losing"
//
// and NEVER produce a combined value like:
//   competitive_status = "bangkok losing"  (the previous bug)
// ──────────────────────────────────────────────────────────────────────────────

describe("Status / Entity Separation Regression", () => {

    const cases = [
        { query: "Why is London losing?",  city: "london",   status: "Losing"  },
        { query: "Why is Bangkok losing?", city: "bangkok",  status: "Losing"  },
        { query: "Why is Phuket losing?",  city: "phuket",   status: "Losing"  },
        { query: "Why is Dubai winning?",  city: "dubai",    status: "Winning" },
    ];

    for (const tc of cases) {
        it(`separates entity and status for: "${tc.query}"`, () => {
            const analysis = analyzeQuestion(tc.query);

            // 1. competitive_status must be exactly the canonical value
            const statusFilters = analysis.filters.filter(f => f.dimension === "competitive_status");
            assert.equal(statusFilters.length, 1,
                `Expected exactly 1 competitive_status filter, got ${statusFilters.length}`);
            assert.equal(
                String(statusFilters[0].value).toLowerCase(),
                tc.status.toLowerCase(),
                `competitive_status value should be "${tc.status}", got "${statusFilters[0].value}"`
            );

            // 2. competitive_status value must NEVER contain a city name
            assert.ok(
                !String(statusFilters[0].value).toLowerCase().includes(tc.city),
                `competitive_status value "${statusFilters[0].value}" must not contain city "${tc.city}"`
            );

            // 3. No filter of any dimension should have a combined "city status" value
            const badFilter = analysis.filters.find(f =>
                String(f.value).toLowerCase().includes(tc.city) &&
                String(f.value).toLowerCase().includes(tc.status.toLowerCase())
            );
            assert.ok(
                !badFilter,
                `Found a combined city+status value in filter: ${JSON.stringify(badFilter)}`
            );
        });
    }
});
