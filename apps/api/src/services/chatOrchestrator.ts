import { getDataset } from "./datasetService.js";
import { downloadDataset } from "./storageService.js";
import { getDatasetSchema } from "./schemaService.js";
import { buildSemanticLayer } from "../ai/semanticLayer.js";
import { buildPrompt } from "../ai/promptBuilder.js";
import { analyzeQuestion } from "../ai/questionAnalyzer.js";
import { validateQuestion } from "../ai/questionValidator.js";
import { routeQuery } from "../ai/queryRouter.js";
import { getCachedSql, setCachedSql } from "./queryCacheService.js";
import { getCachedNarrative, setCachedNarrative, invalidateNarrativeCache } from "./narrativeCacheService.js";
import { ClaudeOutputSchemas, GeneratedQueryResponse } from "../ai/outputSchemas.js";
import { validateSqlSyntax } from "../ai/sqlValidator.js";
import { executeQuery } from "./queryExecutionService.js";
import { extractInsights } from "./insightEngine.js";
import { QuestionValidationError } from "../ai/questionTypes.js";
import { buildDatasetMetadata } from "./metadataService.js";
import { resolveEntities, dedupeFilters } from "../ai/entityResolver.js";
import { generateTrendSql } from "./trendEngine.js";
import { generateComparisonSql } from "./comparisonEngine.js";
import { generateContributionSql } from "./contributionEngine.js";
import { buildRootCausePack } from "./RootCausePackBuilder.js";
import { buildClaudeInputPack } from "./claudeInputContract.js";
import { classifyResponseSource, detectNarrativeRequest, detectRecommendationRequest, ResponseSource } from "./claudeRequestDetector.js";
import { routeClaude } from "./claudeRouter.js";
import { generateNarrative } from "./narrativeGenerator.js";
import { generateRecommendations, Recommendation } from "./recommendationGenerator.js";
import { startTimer, logCache, logRootCause, logClaude } from "./analyticsLogger.js";
import { recordQuery, recordCacheHit, recordCacheMiss, recordError, recordContradiction } from "./analyticsMetrics.js";

export class ChatOrchestrator {
    static async execute(datasetId: string, question: string): Promise<any> {
        const pipelineTimer = startTimer();
        let routeType = "";

        console.log(`\n[QUESTION] "${question}"`);

        // ── 0. Early Recommendation Detection ─────────────────────────────
        // Runs BEFORE route selection. Recommendation queries require a
        // RootCausePack, so they must be forced to ROOT_CAUSE regardless of
        // what the question analyzer classifies (e.g. SUMMARY).
        const isRecommendation = detectRecommendationRequest(question);
        const isNarrative = detectNarrativeRequest(question);
        console.log(`[PRE_ROUTER] recommendation=${isRecommendation} | narrative=${isNarrative}`);

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
            
            const rawFilters = [...parsedQuestion.filters];
            const resolvedFilters = [...entityFilters];

            // Merge entity filters and deduplicate to prevent comparison engine
            // from seeing dozens of duplicate suppliername/destination entries.
            // This MUST happen before validation so the validator sees the investigation target.
            const mergedFilters = dedupeFilters([
                ...parsedQuestion.filters,
                ...entityFilters
            ]);
            parsedQuestion.filters = mergedFilters;

            console.log("MERGED FILTERS:", parsedQuestion.filters);
            console.log(`[PRE_VALIDATION] dimensions=${parsedQuestion.dimensions.length} | rawFilters=${rawFilters.length} | resolvedFilters=${resolvedFilters.length} | mergedFilters=${mergedFilters.length}`);

            const validation = validateQuestion(parsedQuestion, semanticLayer);

            if (!validation.valid) {
                throw new QuestionValidationError(validation);
            }

            // ── 3. Route Decision ──────────────────────────────────────────────
            let sql = "";
            let explanation = "";
            let routeType = "";

            console.log(`[ANALYSIS] intent=${parsedQuestion.intent} | metrics=[${parsedQuestion.metrics}] | dims=[${parsedQuestion.dimensions}] | filters=${parsedQuestion.filters.length}`);

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

                // ── Route Override: Recommendation / Narrative → ROOT_CAUSE ───
                // Recommendation and narrative queries need a RootCausePack.
                // If the analyzer classified this as SUMMARY/TEMPLATE/etc.,
                // override to ROOT_CAUSE so the full analytical pipeline runs.
                if ((isRecommendation || isNarrative) && routeType !== "ROOT_CAUSE" && routeType !== "LLM") {
                    console.log(
                        `[PRE_ROUTER] ${isRecommendation ? "Recommendation" : "Narrative"} query detected — ` +
                        `overriding route from ${routeType} to ROOT_CAUSE`
                    );
                    routeType = "ROOT_CAUSE";
                }

                // ── TEMPLATE ───────────────────────────────────────────────────
                // Check routeType (override-aware) for flow control.
                // Check routing.route for TS discriminated union narrowing (.sql access).
                if (routeType === "TEMPLATE" && routing.route === "TEMPLATE") {
                    sql = routing.sql;
                    explanation = routing.explanation;
                }

                // ── TREND ──────────────────────────────────────────────────────
                else if (routeType === "TREND") {
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
                else if (routeType === "COMPARISON") {
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
                else if (routeType === "CONTRIBUTION") {
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
                else if (routeType === "ROOT_CAUSE") {
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
                    try {
                        logClaude("Starting LLM SQL generation");
                        const claudeTimer = startTimer();
                        const { prompt } = buildPrompt(question, semanticLayer);

                        // Use the existing anthropicService for the one remaining
                        // SQL generation use case. This is the ONLY place Claude
                        // generates SQL — all other paths are deterministic.
                        const { callClaudeWithStructuredOutput } = await import("./anthropicService.js");
                        const generated = await callClaudeWithStructuredOutput<GeneratedQueryResponse>(
                            prompt,
                            ClaudeOutputSchemas.generatedQuery,
                            "SQL_GENERATION",
                            "You are a Senior DuckDB SQL Expert for a travel analytics platform."
                        );
                        sql = generated.sql;
                        explanation = generated.explanation;
                        logClaude("LLM SQL generation complete", claudeTimer.stop());
                    } catch (err: any) {
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
                            console.log(`[RETURN_PATH] EARLY_RETURN_LLM_FAILED`);
                            return {
                                answer: "I was unable to process this query right now. The AI service is temporarily unavailable. Please try a simpler question or try again later.",
                                sql: "",
                                explanation: "Claude API unavailable; no deterministic route available.",
                                results: [],
                                rootCausePack: null,
                                routeType: "FAILED",
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
            }

            // ── 6. Classify response source ───────────────────────────────
            let responseSource: ResponseSource = "ANALYTICS";
            let claudeInputPack = null;
            let recommendations = null;

            if (routeType === "ROOT_CAUSE" && rootCausePack) {
                responseSource = classifyResponseSource(question);
                claudeInputPack = buildClaudeInputPack(question, rootCausePack);
            }

            console.log(`[CLASSIFIER] responseSource=${responseSource} | isRecommendation=${isRecommendation} | isNarrative=${isNarrative}`);

            console.log(`[ROUTE_DECISION] routeType=${routeType} | responseSource=${responseSource} | hasRootCausePack=${!!rootCausePack} | hasClaudeInputPack=${!!claudeInputPack}`);

            if (rootCausePack?.contradictionDetected) {
                recordContradiction();
            }

            // ── 7. Narrative / Recommendation Generation ──────────────────────
            let narrative = "";
            const cachedNarrative = await getCachedNarrative(
                datasetId,
                question.toLowerCase().trim(),
                sql,
                responseSource
            );

            if (cachedNarrative) {
                narrative = cachedNarrative;
                recordCacheHit();
                logCache("Narrative cache HIT", true);
                console.log(`[NARRATIVE_REQUEST] source=CACHE`);
            } else {
                recordCacheMiss();
                logCache("Narrative cache MISS", false);

                // ── CLAUDE_RECOMMENDATION: Sonnet generates recommendations ───
                if (responseSource === "CLAUDE_RECOMMENDATION" && claudeInputPack) {
                    console.log(`🔥 RECOMMENDATION_BRANCH_ENTERED`);
                    console.log(`[NARRATIVE_REQUEST] source=CLAUDE_RECOMMENDATION | routing to recommendationGenerator`);

                    const routerDecision = routeClaude("ROOT_CAUSE", "RECOMMENDATIONS", true);
                    console.log(`[CLAUDE_ROUTER] tier=${routerDecision.tier} | op=${routerDecision.operation} | shouldCall=${routerDecision.shouldCallClaude}`);

                    try {
                        console.log(`🔥 CALLING_SONNET`);
                        console.log(`[ROUTE_CLAUDE_INPUT] analyticsRoute=ROOT_CAUSE | operation=RECOMMENDATIONS | hasValidPack=true`);
                        console.log(`[CLAUDE_CALL] operation=RECOMMENDATIONS | tier=SONNET`);
                        const recResult = await generateRecommendations(claudeInputPack);
                        console.log(`🔥 SONNET_RETURNED`);
                        console.log(`[ROUTE_CLAUDE_OUTPUT] tier=${routerDecision.tier} | operation=${routerDecision.operation} | shouldCallClaude=${routerDecision.shouldCallClaude}`);
                        recommendations = recResult.recommendations;

                        console.log(`[CLAUDE_RESPONSE] recommendations=${recommendations.length} | claudeUsed=${recResult.claudeUsed} | claudeFailed=${recResult.claudeFailed}`);

                        // Build narrative from recommendation results.
                        // DO NOT call generateNarrative() here — it uses HAIKU,
                        // which would override the SONNET tier and produce a
                        // narrative-style response instead of recommendations.
                        narrative = buildRecommendationNarrative(recommendations, claudeInputPack);
                        console.log(`[NARRATIVE_VALUE_SET] source=CLAUDE_RECOMMENDATION | generator=generateRecommendations | preview="${narrative.slice(0, 100)}"`);
                    } catch (err: any) {
                        console.error(`[CLAUDE_CALL] FAILED: ${err.message}`);
                        narrative = buildDeterministicNarrative(question, queryResults, extractInsights(queryResults));
                        responseSource = "ANALYTICS";
                        console.log(`[NARRATIVE_VALUE_SET] source=ANALYTICS_FALLBACK_REC | preview="${narrative.slice(0, 100)}"`);
                    }

                // ── CLAUDE_NARRATIVE: Haiku generates executive narrative ──────
                } else if (responseSource === "CLAUDE_NARRATIVE" && claudeInputPack) {
                    console.log(`[NARRATIVE_REQUEST] source=CLAUDE_NARRATIVE | routing to narrativeGenerator`);

                    const routerDecision = routeClaude("ROOT_CAUSE", "NARRATIVE_GENERATION", true);
                    console.log(`[CLAUDE_ROUTER] tier=${routerDecision.tier} | op=${routerDecision.operation} | shouldCall=${routerDecision.shouldCallClaude}`);

                    try {
                        console.log(`[ROUTE_CLAUDE_INPUT] analyticsRoute=ROOT_CAUSE | operation=NARRATIVE_GENERATION | hasValidPack=true`);
                        console.log(`[CLAUDE_CALL] operation=NARRATIVE_GENERATION | tier=HAIKU`);
                        const narResult = await generateNarrative(claudeInputPack);
                        narrative = narResult.rawNarrative;
                        responseSource = narResult.claudeUsed ? "CLAUDE_NARRATIVE" : "ANALYTICS";

                        console.log(`[CLAUDE_RESPONSE] claudeUsed=${narResult.claudeUsed} | claudeFailed=${narResult.claudeFailed} | chars=${narrative.length}`);
                        console.log(`[NARRATIVE_GENERATOR] executiveSummary=${narResult.executiveSummary.slice(0, 100)}...`);
                        console.log(`[NARRATIVE_VALUE_SET] source=CLAUDE_NARRATIVE | claudeUsed=${narResult.claudeUsed} | preview="${narrative.slice(0, 100)}"`);
                    } catch (err: any) {
                        console.error(`[CLAUDE_CALL] FAILED: ${err.message}`);
                        narrative = buildDeterministicNarrative(question, queryResults, extractInsights(queryResults));
                        responseSource = "ANALYTICS";
                        console.log(`[NARRATIVE_VALUE_SET] source=ANALYTICS_FALLBACK_NAR | preview="${narrative.slice(0, 100)}"`);
                    }

                // ── ANALYTICS: deterministic narrative (no Claude) ─────────────
                } else {
                    console.log(`[NARRATIVE_REQUEST] source=ANALYTICS | deterministic`);
                    narrative = buildDeterministicNarrative(question, queryResults, extractInsights(queryResults));
                    console.log(`[NARRATIVE_VALUE_SET] source=ANALYTICS | preview="${narrative.slice(0, 100)}"`);
                }

                await setCachedNarrative(datasetId, question.toLowerCase().trim(), sql, narrative, responseSource);
            }

            // ── 8. Record metrics ─────────────────────────────────────────────
            const totalLatency = pipelineTimer.stop();
            recordQuery(routeType, totalLatency);

            console.log(
                `[PIPELINE_COMPLETE] route=${routeType} | responseSource=${responseSource} | ` +
                `latency=${totalLatency}ms | narrativeChars=${narrative.length} | ` +
                `recommendations=${recommendations?.length ?? 0}`
            );

            console.log(
                `[RETURN_PATH] MAIN_RETURN | responseSource=${responseSource} | ` +
                `answerPreview="${narrative.slice(0, 120)}" | ` +
                `recommendations=${recommendations?.length ?? 0}`
            );

            // ── 9. Return payload ──────────────────────────────────────────────
            return {
                answer: narrative,
                sql,
                explanation,
                results: queryResults,
                rootCausePack,
                claudeInputPack,
                recommendations,
                responseSource,
                routeType,
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

// ─── Recommendation narrative builder ────────────────────────────────────────

/**
 * Formats Sonnet-generated recommendations into a user-facing narrative.
 * Used in the CLAUDE_RECOMMENDATION branch to avoid a redundant
 * generateNarrative() → HAIKU call.
 */
function buildRecommendationNarrative(
    recommendations: Recommendation[],
    pack: { question: string; metricName: string }
): string {
    if (recommendations.length === 0) {
        return "No actionable recommendations could be generated from the available data.";
    }

    let narrative = `**Strategic Recommendations for: "${pack.question}"**\n\n`;
    narrative += `Based on root cause analysis of ${pack.metricName}:\n\n`;

    for (let i = 0; i < recommendations.length; i++) {
        const rec = recommendations[i];
        narrative += `**${i + 1}. ${rec.action}**\n`;
        if (rec.rationale) {
            narrative += `${rec.rationale}\n`;
        }
        if (rec.supportingEvidence.length > 0) {
            narrative += `Evidence: ${rec.supportingEvidence.join("; ")}\n`;
        }
        if (rec.expectedImpact) {
            narrative += `Expected impact: ${rec.expectedImpact}\n`;
        }
        narrative += "\n";
    }

    return narrative.trim();
}
