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
import { generateStructured, AnthropicClientError } from "./anthropicClient.js";
import { ClaudeOutputSchemas, GeneratedQueryResponse, ExecutiveNarrativeResponse } from "../ai/outputSchemas.js";
import { validateSqlSyntax } from "../ai/sqlValidator.js";
import { executeQuery } from "./queryExecutionService.js";
import { summarizeResults } from "./resultSummarizationService.js";
import { extractInsights } from "./insightEngine.js";
import { QuestionValidationError } from "../ai/questionTypes.js";
import { buildDatasetMetadata } from "./metadataService.js";
import { resolveEntities, dedupeFilters } from "../ai/entityResolver.js";
import { generateTrendSql } from "./trendEngine.js";
import { generateComparisonSql } from "./comparisonEngine.js";
import { generateContributionSql } from "./contributionEngine.js";
import { buildRootCausePack } from "./RootCausePackBuilder.js";
import { buildClaudeInputPack, assertClaudeInputSafe } from "./claudeInputContract.js";
import { routeClaude, shouldUseClaude } from "./claudeRouter.js";
import { generateNarrative } from "./narrativeGenerator.js";
import { generateRecommendations } from "./recommendationGenerator.js";
import { startTimer, logAnalyzer, logRouter, logEngine, logSql, logCache, logRootCause, logValidation, logClaude } from "./analyticsLogger.js";
import { recordQuery, recordCacheHit, recordCacheMiss, recordError, recordContradiction } from "./analyticsMetrics.js";

export class ChatOrchestrator {
    static async execute(datasetId: string, question: string): Promise<any> {
        const pipelineTimer = startTimer();
        let routeType = "";
        let claudeFailed = false;

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

            // Merge entity filters and deduplicate to prevent comparison engine
            // from seeing dozens of duplicate suppliername/destination entries.
            parsedQuestion.filters = dedupeFilters([
                ...parsedQuestion.filters,
                ...entityFilters
            ]);

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
                // Root cause uses the Contribution Engine for SQL across multiple
                // dimensions, then wraps the results in the Root Cause Pack Builder.
                else if (routing.route === "ROOT_CAUSE") {
                    const availableDims = ["hotel", "chain", "supplier", "apw"].filter(dim => 
                        semanticLayer.dimensions.some(d => d.toLowerCase() === dim.toLowerCase())
                    );
                    
                    const rootCauseSqls: string[] = [];
                    const rootCauseExplanations: string[] = [];

                    for (const dim of availableDims) {
                        const result = generateContributionSql(parsedQuestion, semanticLayer, dim);
                        if (result) {
                            rootCauseSqls.push(result.sql);
                            rootCauseExplanations.push(`- ${dim}: ` + result.explanation);
                        }
                    }

                    if (rootCauseSqls.length > 0) {
                        // Store multiple SQLs separated by a delimiter
                        sql = rootCauseSqls.join("\n---\n");
                        explanation = "Multi-dimensional Root Cause Analysis:\n" + rootCauseExplanations.join("\n");
                    } else {
                        console.warn("[ORCHESTRATOR] Root cause: contribution engine returned null for all dims — falling back to LLM.");
                        routeType = "LLM";
                    }
                }

                // ── LLM (fallback) ─────────────────────────────────────────────
                if (routeType === "LLM") {
                    const claudeDecision = routeClaude("LLM", "AD_HOC_REASONING", false);
                    if (claudeDecision.shouldCallClaude) {
                        try {
                            logClaude("Starting LLM SQL generation");
                            const claudeTimer = startTimer();
                            const { prompt } = buildPrompt(question, semanticLayer);
                            const { result } = await generateStructured<GeneratedQueryResponse>({
                                prompt,
                                toolSchema: ClaudeOutputSchemas.generatedQuery,
                                tier: "SONNET",
                                operation: "SQL_GENERATION",
                                systemPrompt: "You are a Senior DuckDB SQL Expert for a travel analytics platform."
                            });
                            sql = result.sql;
                            explanation = result.explanation;
                            logClaude("LLM SQL generation complete", claudeTimer.stop());
                        } catch (err: any) {
                            claudeFailed = true;
                            console.error("[ORCHESTRATOR] Claude SQL generation failed — returning deterministic fallback:", err.message);
                            logClaude(`Claude SQL FAILED: ${err.message}`);
                            // Failover: attempt to use template engine as last resort
                            const fallbackRouting = routeQuery(parsedQuestion, semanticLayer);
                            if (fallbackRouting.route === "TEMPLATE" && fallbackRouting.sql) {
                                sql = fallbackRouting.sql;
                                explanation = "Fallback: Used template engine after Claude failure.";
                                routeType = "TEMPLATE";
                            } else {
                                recordError();
                                return {
                                    answer: "I was unable to process this query right now. The AI service is temporarily unavailable. Please try a simpler question or try again later.",
                                    sql: "",
                                    explanation: "Claude API unavailable; no deterministic route available.",
                                    results: [],
                                    rootCausePack: null,
                                    routeType: "FAILED",
                                    claudeFailed: true,
                                    datasetType: semanticLayer.datasetType,
                                    parsedQuestion: {
                                        intent: parsedQuestion.intent,
                                        metrics: parsedQuestion.metrics,
                                        dimensions: parsedQuestion.dimensions,
                                        timeReferences: parsedQuestion.timeReferences
                                    }
                                };
                            }
                        }
                    } else {
                        console.warn(claudeDecision.reason);
                    }
                }

                // Save to SQL cache (skip ROOT_CAUSE — packs are not cacheable as SQL)
                if (sql && routeType !== "ROOT_CAUSE") {
                    await setCachedSql(semanticLayer.datasetType, question.toLowerCase().trim(), sql);
                }
            }

            console.log("FINAL SQL:\n", sql);

            // ── 4. SQL Validation & Execution ──────────────────────────────────
            let queryResultsList: Record<string, unknown>[][] = [];
            let queryResults: Record<string, unknown>[] = [];
            
            if (routeType === "ROOT_CAUSE") {
                const sqlStatements = sql.split("\n---\n");
                for (const statement of sqlStatements) {
                    const sqlValidation = await validateSqlSyntax(statement, tempPath);
                    if (!sqlValidation.valid) {
                        console.warn(`[ORCHESTRATOR] SQL failed validation in ROOT_CAUSE: ${sqlValidation.error}`);
                        continue;
                    }
                    const res = await executeQuery(statement, tempPath);
                    queryResultsList.push(res);
                }
                queryResults = queryResultsList.find(res => res.length > 0) || [];
            } else {
                const sqlValidation = await validateSqlSyntax(sql, tempPath);
                if (!sqlValidation.valid) {
                    throw new Error(`Generated SQL failed validation: ${sqlValidation.error}`);
                }
                queryResults = await executeQuery(sql, tempPath);
            }

            // ── 5. Root Cause Pack (ROOT_CAUSE route only) ─────────────────────
            let rootCausePack = null;
            if (routeType === "ROOT_CAUSE") {
                rootCausePack = buildRootCausePack(question, semanticLayer, queryResultsList);
                console.log("[ORCHESTRATOR] Root cause pack built:", JSON.stringify(rootCausePack, null, 2));

                console.log(`
[ROOTCAUSE_TRACE]
QUESTION: ${question}
PARSED_ANALYSIS: ${JSON.stringify(parsedQuestion.filters)}
ROUTE: ROOT_CAUSE
TIME_FILTERS: ${JSON.stringify(parsedQuestion.filters.filter(f => ["month", "quarter", "year"].includes(f.dimension)))}
GENERATED_SQL: 
${sql.slice(0, 500)}...
ROW_COUNT: ${queryResultsList.reduce((acc, r) => acc + r.length, 0)}
ROW_SAMPLE: ${JSON.stringify(queryResultsList[0]?.[0] || {})}
CONTRIBUTOR_COUNT: ${(rootCausePack?.topPositiveContributors?.length || 0) + (rootCausePack?.topNegativeContributors?.length || 0)}
PACK_VALIDATION: ${rootCausePack?.validationErrors?.length === 0 ? 'PASSED' : 'FAILED'}
FINAL_RESULT: ${rootCausePack ? 'PACK_BUILT' : 'NULL'}
`);
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
                recordCacheHit();
                logCache("Narrative cache HIT", true);
            } else if (rootCausePack?.contradictionDetected) {
                recordContradiction();
                // Use the narrative generator for contradiction handling
                const claudeInputPack = buildClaudeInputPack(question, rootCausePack);
                const execNarrative = await generateNarrative(claudeInputPack, false);
                narrative = execNarrative.executiveSummary;
                if (execNarrative.contradictionNote) {
                    narrative += "\n\n" + execNarrative.contradictionNote;
                }
            } else {
                recordCacheMiss();
                logCache("Narrative cache MISS", false);

                const DETERMINISTIC_ROUTES = new Set(["TEMPLATE", "TREND", "COMPARISON", "CONTRIBUTION", "ROOT_CAUSE", "CACHE"]);
                const isDeterministic = DETERMINISTIC_ROUTES.has(routeType);

                if (isDeterministic) {
                    // For ROOT_CAUSE with a pack, use the narrative generator
                    if (routeType === "ROOT_CAUSE" && rootCausePack) {
                        const claudeInputPack = buildClaudeInputPack(question, rootCausePack);
                        const execNarrative = await generateNarrative(claudeInputPack, false);
                        narrative = execNarrative.executiveSummary;
                        if (execNarrative.keyDrivers.length > 0) {
                            narrative += "\n\n**Key Drivers:**\n" + execNarrative.keyDrivers.map(d => `- ${d}`).join("\n");
                        }
                        if (execNarrative.risks.length > 0) {
                            narrative += "\n\n**Risks:**\n" + execNarrative.risks.map(r => `- ${r}`).join("\n");
                        }
                    } else {
                        narrative = buildDeterministicNarrative(question, queryResults, extractInsights(queryResults));
                    }
                } else {
                    // LLM narrative generation with Claude Router + failover
                    const claudeDecision = routeClaude(routeType, "NARRATIVE_GENERATION", false);
                    if (claudeDecision.shouldCallClaude) {
                        try {
                            const summaryJson = summarizeResults(queryResults);
                            const insights = extractInsights(queryResults);

                            const narrativePrompt = `
You are an Executive Analytics Copilot. Your audience is a C-level travel industry executive.
The user asked: "${question}"

Here is the data context (COMPRESSED SUMMARY):
${summaryJson}

Here are automatic insights extracted from the data:
${insights.map(i => `- ${i}`).join("\n")}

Write a concise, executive-grade narrative explaining the findings. Do not hallucinate data that is not present.
`;
                            const { result } = await generateStructured<ExecutiveNarrativeResponse>({
                                prompt: narrativePrompt,
                                toolSchema: ClaudeOutputSchemas.executiveNarrative,
                                tier: claudeDecision.tier as "HAIKU" | "SONNET",
                                operation: "NARRATIVE_GENERATION",
                                systemPrompt: "You are a Principal Executive Analyst writing a memo."
                            });

                            narrative = result.narrative;
                        } catch (err: any) {
                            claudeFailed = true;
                            console.error("[ORCHESTRATOR] Claude narrative failed — using deterministic fallback:", err.message);
                            narrative = buildDeterministicNarrative(question, queryResults, extractInsights(queryResults));
                        }
                    } else {
                        console.warn(claudeDecision.reason);
                        narrative = buildDeterministicNarrative(question, queryResults, extractInsights(queryResults));
                    }
                }

                await setCachedNarrative(datasetId, question.toLowerCase().trim(), sql, narrative);
            }

            // ── 7. Recommendations (ROOT_CAUSE only) ──────────────────────────
            let recommendations = null;
            if (routeType === "ROOT_CAUSE" && rootCausePack) {
                const claudeInputPack = buildClaudeInputPack(question, rootCausePack);
                const recResult = await generateRecommendations(claudeInputPack, false);
                recommendations = recResult.recommendations;
                logRootCause(`Generated ${recommendations.length} recommendations (tier=${recResult.claudeTier})`);
            }

            // ── 8. Record metrics ─────────────────────────────────────────────
            const totalLatency = pipelineTimer.stop();
            recordQuery(routeType, totalLatency);

            // ── 9. Return payload ──────────────────────────────────────────────
            return {
                answer: narrative,
                sql,
                explanation,
                results: queryResults,
                rootCausePack,
                recommendations,
                routeType,
                claudeFailed,
                latencyMs: totalLatency,
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
