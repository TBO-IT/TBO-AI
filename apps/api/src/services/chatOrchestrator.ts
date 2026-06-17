import { getDataset } from "./datasetService.js";
import { downloadDataset } from "./storageService.js";
import { getDatasetSchema } from "./schemaService.js";
import { buildSemanticLayer } from "../ai/semanticLayer.js";
import { buildPrompt } from "../ai/promptBuilder.js";
import { analyzeQuestion } from "../ai/questionAnalyzer.js";
import { validateQuestion } from "../ai/questionValidator.js";
import { routeQuery } from "../ai/queryRouter.js";
import { getCachedSql, setCachedSql } from "./queryCacheService.js";
import { getCachedNarrative, setCachedNarrative } from "./narrativeCacheService.js";
import { callClaudeWithStructuredOutput } from "./anthropicService.js";
import { ClaudeOutputSchemas, GeneratedQueryResponse, ExecutiveNarrativeResponse } from "../ai/outputSchemas.js";
import { validateSqlSyntax } from "../ai/sqlValidator.js";
import { executeQuery } from "./queryExecutionService.js";
import { summarizeResults } from "./resultSummarizationService.js";
import { extractInsights } from "./insightEngine.js";
import { QuestionValidationError } from "../ai/questionTypes.js";
import { buildDatasetMetadata } from "./metadataService.js";
import { resolveEntities } from "../ai/entityResolver.js";
import { generateTrendSql } from "./trendEngine.js";
import { generateComparisonSql } from "./comparisonEngine.js";
import { generateContributionSql } from "./contributionEngine.js";
import { buildRootCausePack } from "./RootCausePackBuilder.js";

export class ChatOrchestrator {
    static async execute(datasetId: string, question: string): Promise<any> {

        // ── 1. Fetch Dataset & Schema ──────────────────────────────────────────
        const dataset = await getDataset(datasetId);
        if (!dataset || !dataset.storagePath) {
            throw new Error("Dataset not found or does not have a storage path.");
        }

        const tempPath = await downloadDataset(dataset.storagePath);

        const metadata = await buildDatasetMetadata(tempPath);

        const entityFilters = resolveEntities(question, metadata);

        console.log("ENTITY FILTERS:", entityFilters);
        console.log("DATASET METADATA:", JSON.stringify(metadata, null, 2));

        try {
            const schema = await getDatasetSchema(tempPath);
            console.log(
                `[SCHEMA_COLUMNS] (${schema.length} cols):`,
                schema.map(c => `${c.column_name}(${c.column_type})`).join(" | ")
            );

            const semanticLayer = buildSemanticLayer(schema);
            console.log(
                `[SEMANTIC_LAYER] type=${semanticLayer.datasetType} | ` +
                `dims=[${semanticLayer.dimensions.join(", ")}] | ` +
                `mappings=${JSON.stringify(semanticLayer.columnMappings)}`
            );

            // ── 2. Question Analysis ───────────────────────────────────────────
            const parsedQuestion = analyzeQuestion(question);
            const validation = validateQuestion(parsedQuestion, semanticLayer);

            // Merge entity filters resolved from dataset metadata
            parsedQuestion.filters = [
                ...parsedQuestion.filters,
                ...entityFilters
            ];

            console.log("MERGED FILTERS:", parsedQuestion.filters);

            if (!validation.valid) {
                throw new QuestionValidationError(validation);
            }

            // ── 3. Route Decision ──────────────────────────────────────────────
            let sql = "";
            let explanation = "";
            let routeType = "";

            // SQL cache bypass — disable to force fresh routing during development
            // const cachedSql = await getCachedSql(semanticLayer.datasetType, question.toLowerCase().trim());
            const cachedSql = null;

            if (cachedSql) {
                sql = cachedSql;
                explanation = "Retrieved from SQL cache.";
                routeType = "CACHE";
            } else {
                const routing = routeQuery(parsedQuestion, semanticLayer);
                routeType = routing.route;

                console.log("ROUTING:", JSON.stringify(routing, null, 2));

                // ── TEMPLATE ───────────────────────────────────────────────────
                if (routing.route === "TEMPLATE") {
                    sql = routing.sql;
                    explanation = routing.explanation;
                }

                // ── TREND ──────────────────────────────────────────────────────
                else if (routing.route === "TREND") {
                    const result = generateTrendSql(parsedQuestion, semanticLayer);
                    if (result) {
                        sql = result.sql;
                        explanation = result.explanation;
                    } else {
                        console.warn("[ORCHESTRATOR] Trend engine returned null — falling back to LLM.");
                        routeType = "LLM";
                    }
                }

                // ── COMPARISON ─────────────────────────────────────────────────
                else if (routing.route === "COMPARISON") {
                    const result = generateComparisonSql(parsedQuestion, semanticLayer);
                    if (result) {
                        sql = result.sql;
                        explanation = result.explanation;
                    } else {
                        console.warn("[ORCHESTRATOR] Comparison engine returned null — falling back to LLM.");
                        routeType = "LLM";
                    }
                }

                // ── CONTRIBUTION ───────────────────────────────────────────────
                else if (routing.route === "CONTRIBUTION") {
                    const result = generateContributionSql(parsedQuestion, semanticLayer);
                    if (result) {
                        sql = result.sql;
                        explanation = result.explanation;
                    } else {
                        console.warn("[ORCHESTRATOR] Contribution engine returned null — falling back to LLM.");
                        routeType = "LLM";
                    }
                }

                // ── ROOT_CAUSE ─────────────────────────────────────────────────
                // Root cause uses the Contribution Engine for SQL, then wraps
                // the results in the Root Cause Pack Builder for structured output.
                // No Claude call — factual structured pack only.
                else if (routing.route === "ROOT_CAUSE") {
                    const result = generateContributionSql(parsedQuestion, semanticLayer);
                    if (result) {
                        sql = result.sql;
                        explanation = result.explanation;
                    } else {
                        console.warn("[ORCHESTRATOR] Root cause: contribution engine returned null — falling back to LLM.");
                        routeType = "LLM";
                    }
                }

                // ── LLM (fallback) ─────────────────────────────────────────────
                if (routeType === "LLM") {
                    const { prompt } = buildPrompt(question, semanticLayer);
                    const generated = await callClaudeWithStructuredOutput<GeneratedQueryResponse>(
                        prompt,
                        ClaudeOutputSchemas.generatedQuery,
                        "SQL_GENERATION",
                        "You are a Senior DuckDB SQL Expert for a travel analytics platform."
                    );
                    sql = generated.sql;
                    explanation = generated.explanation;
                }

                // Save to SQL cache (skip ROOT_CAUSE — packs are not cacheable as SQL)
                if (sql && routeType !== "ROOT_CAUSE") {
                    await setCachedSql(semanticLayer.datasetType, question.toLowerCase().trim(), sql);
                }
            }

            console.log("FINAL SQL:\n", sql);

            // ── 4. SQL Validation & Execution ──────────────────────────────────
            const sqlValidation = await validateSqlSyntax(sql, tempPath);
            if (!sqlValidation.valid) {
                throw new Error(`Generated SQL failed validation: ${sqlValidation.error}`);
            }

            const queryResults = await executeQuery(sql, tempPath);

            // ── 5. Root Cause Pack (ROOT_CAUSE route only) ─────────────────────
            let rootCausePack = null;
            if (routeType === "ROOT_CAUSE") {
                rootCausePack = buildRootCausePack(question, semanticLayer, queryResults);
                console.log("[ORCHESTRATOR] Root cause pack built:", JSON.stringify(rootCausePack, null, 2));
            }

            // ── 6. Narrative Generation ────────────────────────────────────────
            let narrative = "";
            const cachedNarrative = await getCachedNarrative(
                datasetId,
                question.toLowerCase().trim(),
                sql
            );

            if (cachedNarrative) {
                narrative = cachedNarrative;
            } else {
                const DETERMINISTIC_ROUTES = new Set(["TEMPLATE", "TREND", "COMPARISON", "CONTRIBUTION", "ROOT_CAUSE", "CACHE"]);
                const isDeterministic = DETERMINISTIC_ROUTES.has(routeType);

                if (isDeterministic) {
                    narrative = buildDeterministicNarrative(question, queryResults, extractInsights(queryResults));
                } else {
                    // LLM narrative generation
                    const summaryJson = summarizeResults(queryResults);
                    const insights = extractInsights(queryResults);

                    const narrativePrompt = `
You are an Executive Analytics Copilot. Your audience is a C-level travel industry executive.
The user asked: "${question}"

Here is the data context (COMPRESSED SUMMARY):
${summaryJson}

Here are automatic insights extracted from the data:
${insights.map(i => `- ${i}`).join("\n")}

Write a concise, executive-grade narrative explaining the findings. Do not hallucinate data that is not present. Focus on the 'why' if the intent was root cause, or the 'what' if it was a summary/ranking.
`;
                    const narrativeResponse = await callClaudeWithStructuredOutput<ExecutiveNarrativeResponse>(
                        narrativePrompt,
                        ClaudeOutputSchemas.executiveNarrative,
                        "NARRATIVE_GENERATION",
                        "You are a Principal Executive Analyst writing a memo."
                    );

                    narrative = narrativeResponse.narrative;
                }

                await setCachedNarrative(datasetId, question.toLowerCase().trim(), sql, narrative);
            }

            // ── 7. Return payload ──────────────────────────────────────────────
            return {
                answer: narrative,
                sql,
                explanation,
                results: queryResults,
                rootCausePack,
                routeType,
                datasetType: semanticLayer.datasetType,
                parsedQuestion: {
                    intent: parsedQuestion.intent,
                    metrics: parsedQuestion.metrics,
                    dimensions: parsedQuestion.dimensions,
                    timeReferences: parsedQuestion.timeReferences
                }
            };

        } finally {
            // Clean up downloaded dataset (retry on Windows EBUSY)
            const fs = await import("fs/promises");
            for (let i = 0; i < 50; i++) {
                try {
                    await fs.unlink(tempPath);
                    break;
                } catch (err: any) {
                    if (err.code === "EBUSY" && i < 49) {
                        await new Promise(r => setTimeout(r, 200));
                    } else {
                        console.error("Failed to delete temp file:", tempPath, err);
                    }
                }
            }
        }
    }
}

// ─── Deterministic narrative builder ─────────────────────────────────────────

/**
 * Generates a clean factual narrative from raw query results.
 * Used for all deterministic routes (TEMPLATE, TREND, COMPARISON, CONTRIBUTION, ROOT_CAUSE).
 * No Claude involved.
 */
function buildDeterministicNarrative(
    question: string,
    queryResults: Record<string, unknown>[],
    insights: string[]
): string {
    if (!queryResults || queryResults.length === 0) {
        return "No data found for this query.";
    }

    if (queryResults.length === 1) {
        const row = queryResults[0];
        const facts = Object.entries(row).map(([k, v]) => {
            const formatted = typeof v === "number"
                ? (Number.isInteger(v) ? v.toString() : v.toFixed(2))
                : String(v ?? "");
            return `- **${k}**: ${formatted}`;
        }).join("\n");
        return `Based on the data, here is the summary for your query:\n\n${facts}`;
    }

    let narrative = `Here are the top results for your query: "${question}".\n\n`;

    const topRows = queryResults.slice(0, 5).map((row, idx) => {
        const entries = Object.entries(row).map(([k, v]) => {
            const formatted = typeof v === "number"
                ? (Number.isInteger(v) ? v.toString() : v.toFixed(2))
                : String(v ?? "");
            return `${k}: ${formatted}`;
        });
        return `${idx + 1}. ${entries.join(" | ")}`;
    }).join("\n");

    narrative += `${topRows}\n`;

    if (insights.length > 0 && insights[0] !== "No data available for insights.") {
        narrative += `\n**Key Observations:**\n` + insights.map(i => `- ${i}`).join("\n");
    }

    return narrative;
}
