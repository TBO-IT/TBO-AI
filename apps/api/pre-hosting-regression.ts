/**
 * Pre-hosting regression suite — orchestration layer validation.
 * Runs against sample100.csv without Prisma/Claude.
 */
import { analyzeQuestion } from "./src/ai/questionAnalyzer.js";
import { routeQuery } from "./src/ai/queryRouter.js";
import { validateQuestion } from "./src/ai/questionValidator.js";
import { inferDefaultMetric } from "./src/ai/metricInference.js";
import { buildSemanticLayer } from "./src/ai/semanticLayer.js";
import { getDatasetSchema } from "./src/services/schemaService.js";
import { buildDatasetMetadata } from "./src/services/metadataService.js";
import { resolveEntities, dedupeFilters } from "./src/ai/entityResolver.js";
import { validateEntityExistence, shouldValidateEntityExistence } from "./src/services/entityExistenceValidator.js";
import { detectSortDirection, detectQueryPolarity } from "./src/ai/queryPolarity.js";
import { generateTemplatedSql } from "./src/ai/sqlTemplateEngine.js";
import { extractComparisonEntities } from "./src/services/comparisonEngine.js";
import { detectRecommendationRequest } from "./src/services/claudeRequestDetector.js";
import { runExecutivePriorityPipeline } from "./src/services/executivePriorityEngine.js";
import { buildComparisonPack, formatComparisonNarrative } from "./src/services/comparisonPackBuilder.js";

const CSV = "uploads/sample100.csv";

const SCHEMA = await getDatasetSchema(CSV);
const SL = buildSemanticLayer(SCHEMA);
const METADATA = await buildDatasetMetadata(CSV);

const REGRESSION_QUERIES = [
    "What should we focus on first?",
    "What gives us the highest ROI opportunity?",
    "What is the fastest win available?",
    "What is hurting us the most?",
    "If we only fix one thing, what should it be?",
    "What should we do to improve our worst APW bucket?",
    "Why is Bangkok losing?",
    "Which destination should we prioritize?",
    "Which hotel should we focus on first?",
    "Which hotel is creating the biggest drag on win rate?",
    "Which supplier is hurting us the most?",
    "What should we do about HotelBeds?",
    "Compare TripJack and Otilla and tell me where to focus."
];

interface Result {
    query: string;
    intent: string;
    route: string;
    valid: boolean;
    metric: string;
    polarity: string;
    sortDir: string;
    entityOk: boolean;
    primaryTarget?: string;
    error?: string;
}

async function testQuery(question: string): Promise<Result> {
    const base: Result = {
        query: question.slice(0, 50),
        intent: "",
        route: "",
        valid: false,
        metric: "",
        polarity: detectQueryPolarity(question),
        sortDir: detectSortDirection(question),
        entityOk: true
    };

    try {
        let analysis = analyzeQuestion(question);
        analysis = inferDefaultMetric(question, analysis, SL);
        const entityFilters = resolveEntities(question, METADATA);
        analysis.filters = dedupeFilters([...analysis.filters, ...entityFilters]);

        const entityCheck = shouldValidateEntityExistence(question)
            ? validateEntityExistence(analysis.filters, METADATA)
            : { valid: true };
        if (!entityCheck.valid) {
            return { ...base, intent: analysis.intent, entityOk: false, error: entityCheck.message };
        }

        const validation = validateQuestion(analysis, SL);
        let routing = routeQuery(analysis, SL);

        // Simulate orchestrator recommendation override
        if (detectRecommendationRequest(question) &&
            !["EXECUTIVE_PRIORITY", "COMPARE_ENTITIES", "LLM"].includes(routing.route)) {
            routing = { ...routing, route: "ROOT_CAUSE" as const, type: "ROOT_CAUSE" as const };
        }

        base.intent = analysis.intent;
        base.route = routing.route;
        base.valid = validation.valid;
        base.metric = analysis.metrics.join(",") || "inferred-at-runtime";

        if (question.includes("HotelBeds")) {
            const check = validateEntityExistence(analysis.filters, METADATA);
            return { ...base, intent: analysis.intent, entityOk: check.valid, valid: !check.valid, error: check.message };
        }

        if (routing.route === "EXECUTIVE_PRIORITY") {
            const result = await runExecutivePriorityPipeline(question, analysis, SL, CSV);
            base.primaryTarget = result.executivePack.primaryTarget?.name;
            base.valid = true;
        }

        if (routing.route === "COMPARE_ENTITIES") {
            const entities = extractComparisonEntities(analysis, SL);
            if (entities) {
                const pack = await buildComparisonPack(entities.left, entities.right, entities.dimension, entities.physicalCol, SL, CSV);
                const narrative = formatComparisonNarrative(pack);
                base.valid = narrative.includes("Winner") && narrative.includes("Recommended Action");
                base.primaryTarget = pack.loser;
            }
        }

        if (routing.route === "TEMPLATE" && analysis.intent === "RANKING") {
            const sql = generateTemplatedSql(analysis, SL);
            base.valid = validation.valid && !!sql;
            if (question.toLowerCase().includes("drag")) {
                base.valid = base.valid && base.sortDir === "ASC";
            }
        }

        if (routing.route === "ROOT_CAUSE") {
            base.valid = validation.valid && analysis.metrics.length > 0;
        }

        if (!validation.valid) {
            base.error = validation.errors.join("; ");
        }

        return base;
    } catch (e: any) {
        return { ...base, error: e.message };
    }
}

console.log("\n=== PRE-HOSTING REGRESSION SUITE ===\n");
const results: Result[] = [];
for (const q of REGRESSION_QUERIES) {
    results.push(await testQuery(q));
}

console.table(results);

const failed = results.filter(r => {
    if (r.query.includes("HotelBeds")) return r.entityOk !== false;
    return !r.valid || r.error;
});

// HotelBeds should fail entity check
const hotelBeds = results.find(r => r.query.includes("HotelBeds"));
if (hotelBeds && hotelBeds.entityOk) {
    console.error("FAIL: HotelBeds should not pass entity validation");
    process.exit(1);
}

const othersFailed = results.filter(r => !r.query.includes("HotelBeds") && (!r.valid || r.error));
if (othersFailed.length > 0) {
    console.error(`\n${othersFailed.length} queries failed:`);
    othersFailed.forEach(r => console.error(`  - ${r.query}: ${r.error ?? "invalid"}`));
    process.exit(1);
}

console.log(`\n✓ All ${REGRESSION_QUERIES.length} regression queries passed (${REGRESSION_QUERIES.length - 1} success + 1 entity rejection)`);
