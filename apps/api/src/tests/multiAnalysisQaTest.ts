/**
 * Multi-Analysis QA Test
 *
 * Acts as a QA engineer tracing each business question through the complete
 * planning pipeline without requiring a live dataset or DuckDB connection.
 *
 * For each question, reports:
 *  1. Detected intent
 *  2. Selected Business Objective
 *  3. Analysis Plan (ordered steps)
 *  4. Computed routeType (MULTI_ANALYSIS vs single route)
 *  5. Expected engines to execute
 *  6. PASS/FAIL verdict with failure reason
 */

import { analyzeQuestion } from "../ai/questionAnalyzer.js";
import { objectiveSelector } from "../ai/objectives/bootstrap.js";
import { analysisPlanner } from "../ai/planning/bootstrap.js";
import { planExecution, routeQuery } from "../ai/queryRouter.js";
import { buildSemanticLayer } from "../ai/semanticLayer.js";

// ─── Mock Semantic Layer ───────────────────────────────────────────────────────
// Simulates a competitiveness dataset schema so we can exercise the router
// and SQL generators without a real DuckDB file.

const MOCK_SCHEMA = [
    { column_name: "destination",      column_type: "VARCHAR" },
    { column_name: "suppliername",     column_type: "VARCHAR" },
    { column_name: "tbo_chainname",    column_type: "VARCHAR" },
    { column_name: "tbo_hotelname",    column_type: "VARCHAR" },
    { column_name: "Competitive Status", column_type: "VARCHAR" },
    { column_name: "price_diff_perc",  column_type: "DOUBLE" },
    { column_name: "apw_bucket",       column_type: "VARCHAR" },
    { column_name: "thirdparty",       column_type: "VARCHAR" },
    { column_name: "checkin_month",    column_type: "VARCHAR" },
    { column_name: "checkin_week",     column_type: "VARCHAR" },
    { column_name: "Searches",         column_type: "BIGINT" },
    { column_name: "Bookings",         column_type: "BIGINT" },
    { column_name: "Total Sales",      column_type: "DOUBLE" },
];

const mockSemanticLayer = buildSemanticLayer(MOCK_SCHEMA);

// ─── Test Case Definitions ─────────────────────────────────────────────────────

interface TestCase {
    question: string;
    /** The routeType we REQUIRE to see for this question to PASS */
    expectedRoute: string;
    /** Analysis IDs we expect to execute (checked only when route = MULTI_ANALYSIS) */
    expectedAnalyses?: string[];
    /** Human-readable description of what "correct" looks like */
    correctBehaviour: string;
}

const TEST_CASES: TestCase[] = [
    {
        question: "What changed WoW and why?",
        expectedRoute: "MULTI_ANALYSIS",
        expectedAnalyses: ["trend-analysis", "diagnosis-analysis"],
        correctBehaviour: "TREND intent → growth-diagnosis objective → EXPLAIN+DIAGNOSE plan → MULTI_ANALYSIS. Runs TrendSQL then ContributionSQL across dims."
    },
    {
        question: "What changed MoM and why?",
        expectedRoute: "MULTI_ANALYSIS",
        expectedAnalyses: ["trend-analysis", "diagnosis-analysis"],
        correctBehaviour: "TREND intent → growth-diagnosis objective → EXPLAIN+DIAGNOSE plan → MULTI_ANALYSIS. Runs TrendSQL then ContributionSQL across dims."
    },
    {
        question: "How is Marriott performing in London?",
        expectedRoute: "PERFORMANCE",
        correctBehaviour: "SUMMARY intent with entity filters → general-performance → single step PERFORMANCE route (shows entity-scoped performance scorecard)."
    },
    {
        question: "Compare Marriott and Hilton.",
        expectedRoute: "COMPARE_ENTITIES",
        correctBehaviour: "Two named entities → COMPARE_ENTITIES pack builder. Must NOT fall into MULTI_ANALYSIS."
    },
    {
        question: "Which destinations should I focus on?",
        expectedRoute: "EXECUTIVE_PRIORITY",
        correctBehaviour: "EXECUTIVE_PRIORITY intent → risk-assessment or general-performance → EXECUTIVE_PRIORITY override fires."
    },
    {
        question: "Which suppliers are my most efficient?",
        expectedRoute: "TEMPLATE",
        correctBehaviour: "RANKING intent with supplier dimension → TEMPLATE engine. Acceptable single route."
    },
    {
        question: "Why is Marriott losing bookings?",
        expectedRoute: "ROOT_CAUSE",
        correctBehaviour: "ROOT_CAUSE intent → general-performance (single plan step) → legacy router → ROOT_CAUSE pipeline with multi-dim contribution analysis."
    },
    {
        question: "Which competitor is hurting us most?",
        expectedRoute: "EXECUTIVE_PRIORITY",
        correctBehaviour: "EXECUTIVE_PRIORITY intent ('hurting us most' keyword) → EXECUTIVE_PRIORITY pipeline."
    },
    {
        question: "In losing destinations, which hotels should I focus on?",
        expectedRoute: "EXECUTIVE_PRIORITY",
        correctBehaviour: "EXECUTIVE_PRIORITY intent ('focus on' keyword) → EXECUTIVE_PRIORITY pipeline."
    },
    {
        question: "Which chains are performing well?",
        expectedRoute: "TEMPLATE",
        correctBehaviour: "SUMMARY intent with chain dimension → TEMPLATE engine with chain grouping."
    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bold(s: string)  { return `\x1b[1m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string)   { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string){ return `\x1b[33m${s}\x1b[0m`; }
function cyan(s: string)  { return `\x1b[36m${s}\x1b[0m`; }
function dim(s: string)   { return `\x1b[2m${s}\x1b[0m`; }

function divider(label: string) {
    const line = "─".repeat(70);
    console.log(`\n${line}`);
    console.log(bold(label));
    console.log(line);
}

// ─── Compute routeType ────────────────────────────────────────────────────────
// Mirrors the logic in chatOrchestrator.ts so this test is authoritative.

function computeRouteType(
    question: string
): {
    intent: string;
    objectiveId: string;
    objectiveName: string;
    analysisPlan: { id: string; name: string; capability: string; purpose: string }[];
    routeType: string;
    routeDecision: string;
    executionPlanRoutes: string[];
    issues: string[];
} {
    const issues: string[] = [];

    // ── 1. Analyze ────────────────────────────────────────────────────────────
    const parsedQuestion = analyzeQuestion(question);
    const intent = parsedQuestion.intent;

    // ── 2. Objective selection ────────────────────────────────────────────────
    const objective = objectiveSelector.select(parsedQuestion);

    // ── 3. Analysis plan ──────────────────────────────────────────────────────
    const analysisPlan = analysisPlanner.createPlan(objective);
    const planSummary = analysisPlan.analyses.map(pa => ({
        id: pa.analysis.id,
        name: pa.analysis.name,
        capability: pa.analysis.capability,
        purpose: pa.purpose
    }));

    // ── 4. Route Decision (mirrors chatOrchestrator.ts exactly) ───────────────
    let routeType: string;
    let routeDecision: string;

    const planHasTrendStep    = analysisPlan.analyses.some(pa =>
        pa.analysis.capability === "EXPLAIN" || pa.analysis.id === "trend-analysis"
    );
    const planHasDiagnoseStep = analysisPlan.analyses.some(pa =>
        pa.analysis.capability === "DIAGNOSE" || pa.analysis.id === "diagnosis-analysis"
    );
    const planPrimaryIsCompare = analysisPlan.analyses.length > 0 &&
        (analysisPlan.analyses[0].analysis.capability === "COMPARE" ||
         analysisPlan.analyses[0].analysis.id === "comparison-analysis");
    const requiresMultiAnalysis = planHasTrendStep && planHasDiagnoseStep && !planPrimaryIsCompare;

    if (requiresMultiAnalysis) {
        routeType = "MULTI_ANALYSIS";
        routeDecision = `Plan has EXPLAIN+DIAGNOSE steps (not compare-primary) → MULTI_ANALYSIS`;
    } else {
        const executionPlan = planExecution(parsedQuestion, mockSemanticLayer);
        const routing = executionPlan[0];
        routeType = routing.route;
        routeDecision = `Single-step plan → legacy router → ${routing.route}`;
    }

    // ── Route overrides (same as chatOrchestrator.ts) ─────────────────────────
    // Competitor detection is not simulated here (needs metadata), but we can
    // still exercise recommendation/narrative overrides.

    // Executive priority override
    if (intent === "EXECUTIVE_PRIORITY" && routeType !== "EXECUTIVE_PRIORITY") {
        issues.push(`WARN: Intent=EXECUTIVE_PRIORITY but route was ${routeType}; would be overridden to EXECUTIVE_PRIORITY in orchestrator`);
        routeType = "EXECUTIVE_PRIORITY";
    }

    // Compute legacy execution plan routes for transparency
    const legacyPlan = planExecution(parsedQuestion, mockSemanticLayer);
    const executionPlanRoutes = legacyPlan.map(r => r.route);

    return {
        intent,
        objectiveId: objective.id,
        objectiveName: objective.name,
        analysisPlan: planSummary,
        routeType,
        routeDecision,
        executionPlanRoutes,
        issues
    };
}

// ─── QA Runner ────────────────────────────────────────────────────────────────

interface QAResult {
    question: string;
    pass: boolean;
    failureReason?: string;
    details: ReturnType<typeof computeRouteType>;
}

function runQA(tc: TestCase): QAResult {
    let details: ReturnType<typeof computeRouteType>;
    try {
        details = computeRouteType(tc.question);
    } catch (err: any) {
        // Return a synthetic failed result so we can report all failures at once
        return {
            question: tc.question,
            pass: false,
            failureReason: `CRASH in pipeline: ${err.message}`,
            details: {
                intent: "UNKNOWN",
                objectiveId: "UNKNOWN",
                objectiveName: "UNKNOWN",
                analysisPlan: [],
                routeType: "CRASH",
                routeDecision: err.message,
                executionPlanRoutes: [],
                issues: [err.message]
            }
        };
    }
    let pass = true;
    let failureReason: string | undefined;

    if (details.routeType !== tc.expectedRoute) {
        pass = false;
        failureReason = `Expected routeType=${tc.expectedRoute} but got ${details.routeType}. ` +
            `Intent=${details.intent}, Objective=${details.objectiveId}. ` +
            `RouteDecision: "${details.routeDecision}"`;
    } else if (tc.expectedRoute === "MULTI_ANALYSIS" && tc.expectedAnalyses) {
        const planIds = details.analysisPlan.map(a => a.id);
        const missing = tc.expectedAnalyses.filter(id => !planIds.includes(id));
        if (missing.length > 0) {
            pass = false;
            failureReason = `MULTI_ANALYSIS route correct, but missing analysis steps: [${missing.join(", ")}]. ` +
                `Plan only has: [${planIds.join(", ")}]`;
        }
    }

    return { question: tc.question, pass, failureReason, details };
}

// ─── Report ───────────────────────────────────────────────────────────────────

async function main() {
    // Suppress noisy console.log from analyzers in this output
    const originalLog = console.log;
    console.log = () => {};
    
    const results: QAResult[] = TEST_CASES.map(runQA);
    
    console.log = originalLog;

    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;

    console.log(bold("\n╔══════════════════════════════════════════════════════════════════════╗"));
    console.log(bold("║         MULTI-ANALYSIS QA REPORT — FULL PIPELINE TRACE              ║"));
    console.log(bold("╚══════════════════════════════════════════════════════════════════════╝"));
    console.log(`\n${bold("Summary:")} ${green(`${passed} PASSED`)}  ${failed > 0 ? red(`${failed} FAILED`) : dim("0 FAILED")}`);

    for (const result of results) {
        divider(`Q: "${result.question}"`);

        const d = result.details;

        console.log(`${cyan("Intent detected:")}        ${bold(d.intent)}`);
        console.log(`${cyan("Objective selected:")}     ${bold(d.objectiveName)} (${d.objectiveId})`);

        console.log(`\n${cyan("Analysis Plan:")}`);
        if (d.analysisPlan.length === 0) {
            console.log(`  ${yellow("(empty — no analyses in plan)")}`);
        } else {
            for (const a of d.analysisPlan) {
                console.log(`  ${a.id} → capability: ${a.capability}`);
                console.log(`  ${dim("purpose: " + a.purpose)}`);
            }
        }

        console.log(`\n${cyan("Route Decision:")}         ${bold(d.routeType)}`);
        console.log(`${dim("  " + d.routeDecision)}`);
        console.log(`${cyan("Legacy Router Options:")}  [${d.executionPlanRoutes.join(", ")}]`);

        if (d.issues.length > 0) {
            for (const issue of d.issues) {
                console.log(`${yellow("  ⚠ " + issue)}`);
            }
        }

        // Expected engines
        const tc = TEST_CASES.find(t => t.question === result.question)!;
        console.log(`\n${cyan("Expected Behaviour:")}`);
        console.log(`  ${dim(tc.correctBehaviour)}`);

        // Verdict
        if (result.pass) {
            console.log(`\n${green("  ✅ PASS")}`);
        } else {
            console.log(`\n${red("  ❌ FAIL:")}`);
            console.log(`  ${red(result.failureReason ?? "Unknown failure")}`);
        }
    }

    // ── Failure Summary ────────────────────────────────────────────────────────
    const failures = results.filter(r => !r.pass);
    if (failures.length > 0) {
        divider("FAILURES REQUIRING FIXES");
        for (const f of failures) {
            console.log(red(`\n• "${f.question}"`));
            console.log(`  ${f.failureReason}`);
            console.log(`  ${dim("Intent=" + f.details.intent + " | Objective=" + f.details.objectiveId + " | Plan=[" + f.details.analysisPlan.map(a => a.id).join(", ") + "]")}`);
        }
    } else {
        divider("ALL TESTS PASSED");
        console.log(green("  Every question routes to the correct execution path. ✅"));
    }

    console.log("\n");

    // Return non-zero exit code on failures so CI picks it up
    if (failures.length > 0) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
