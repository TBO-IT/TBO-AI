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
import { generateComparisonSql, extractComparisonEntities } from "./comparisonEngine.js";
import { generateContributionSql } from "./contributionEngine.js";
import { generateCompetitorStrategySql } from "./analytics/competitorStrategyEngine.js";
import { buildRootCausePack } from "./RootCausePackBuilder.js";
import { buildExecutivePack } from "./insights/executivePackBuilder.js";
import { executeEntityDrilldown } from "./insights/entityDrilldownEngine.js";
import { generateAttributedRecommendations } from "./insights/recommendationAttributionEngine.js";
import { buildClaudeInputPack } from "./claudeInputContract.js";
import { classifyResponseSource, detectNarrativeRequest, detectRecommendationRequest, isExecutivePriorityQuestion, ResponseSource } from "./claudeRequestDetector.js";
import { inferDefaultMetric } from "../ai/metricInference.js";
import { validateEntityExistence, shouldValidateEntityExistence } from "./entityExistenceValidator.js";
import { validateRecommendationGuardrails } from "./recommendationGuardrails.js";
import { runExecutivePriorityPipeline } from "./executivePriorityEngine.js";
import { buildComparisonPack, formatComparisonNarrative } from "./comparisonPackBuilder.js";
import { isNegativeIntent, isPositiveIntent } from "../ai/queryPolarity.js";
import { routeClaude } from "./claudeRouter.js";
import { generateNarrative, generateNarrativeStream } from "./narrativeGenerator.js";
import { generateRecommendations, Recommendation } from "./recommendationGenerator.js";
import { detectCompetitorContext, CompetitorContext } from "./competitorDetector.js";
import { startTimer, logCache, logRootCause, logClaude } from "./analyticsLogger.js";
import { recordQuery, recordCacheHit, recordCacheMiss, recordError, recordContradiction } from "./analyticsMetrics.js";
import { TargetPolarity } from "./insights/actionabilityEngine.js";
import { PerformanceTimer } from "../lib/performanceTimer.js";
import { logger } from "../lib/logger.js";

export class ChatOrchestrator {
    static async execute(
        datasetId: string,
        userId: string,
        question: string,
        opts?: {
            onClaudeToken?: (chunk: string) => void;
            abortSignal?: AbortSignal;
        }
    ): Promise<any> {
        const timer = new PerformanceTimer("Chat Query");
        let currentStage = "Init";
        let parsedIntent = "Unknown";
        let routeType = "";
        let tempPath = "";
        let competitorContext: CompetitorContext | null = null;
        const pipelineTimer = startTimer();

        console.log(`\n[QUESTION] "${question}"`);

        try {
            currentStage = "Early Detection";
            // ── 0. Early Recommendation Detection ─────────────────────────────
            // Runs BEFORE route selection. Recommendation queries require a
            // RootCausePack, so they must be forced to ROOT_CAUSE regardless of
            // what the question analyzer classifies (e.g. SUMMARY).
            const isRecommendation = detectRecommendationRequest(question);
            const isNarrative = detectNarrativeRequest(question);
            console.log(`[PRE_ROUTER] recommendation=${isRecommendation} | narrative=${isNarrative}`);

            currentStage = "Dataset Fetch";
            // ── 1. Fetch Dataset & Schema ──────────────────────────────────────────
            const dataset = await getDataset(datasetId , userId);
            if (!dataset || !dataset.storagePath) {
                throw new Error("Dataset not found or does not have a storage path.");
            }

            tempPath = await downloadDataset(dataset.storagePath);

            const metadata = await buildDatasetMetadata(tempPath);

            const entityFilters = resolveEntities(question, metadata);

            console.log("ENTITY FILTERS:", entityFilters);
            console.log("DATASET METADATA:", JSON.stringify(metadata, null, 2));

            currentStage = "Schema Extraction";
            const schema = await getDatasetSchema(tempPath);
            console.log(
                `[SCHEMA_COLUMNS] (${schema.length} cols):`,
                schema.map(c => `${c.column_name}(${c.column_type})`).join(" | ")
            );

            const semanticLayer = buildSemanticLayer(schema);
            timer.checkpoint("Dataset + schema");
            console.log(
                `[SEMANTIC_LAYER] type=${semanticLayer.datasetType} | ` +
                `dims=[${semanticLayer.dimensions.join(", ")}] | ` +
                `mappings=${JSON.stringify(semanticLayer.columnMappings)}`
            );

            currentStage = "Question Analysis";
            // ── 2. Question Analysis ───────────────────────────────────────────
            let parsedQuestion = analyzeQuestion(question);
            parsedQuestion = inferDefaultMetric(question, parsedQuestion, semanticLayer);
            parsedIntent = parsedQuestion.intent;
            
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

            // ── Competitor Detection ─────────────────────────────────────────
            // Runs AFTER entity resolution and filter merging.
            // If a competitor is detected, inject a supplier filter so the
            // entire downstream pipeline (SQL, RCA, drilldowns) is scoped
            // to that competitor's data.
            competitorContext = detectCompetitorContext(
                question,
                metadata,
                mergedFilters.map(f => ({ dimension: f.dimension, value: f.value }))
            );

            if (competitorContext) {
                // Check if we already have a supplier filter for this competitor
                const alreadyFiltered = mergedFilters.some(
                    f => (f.dimension === "supplier" || f.dimension === "thirdparty") &&
                         String(f.value).toLowerCase() === competitorContext!.competitorName.toLowerCase()
                );
                if (!alreadyFiltered) {
                    const compFilter: any = {
                        dimension: "thirdparty",
                        operator: "=",
                        value: competitorContext.competitorName
                    };
                    parsedQuestion.filters.push(compFilter);
                    console.log(
                        `[COMPETITOR_FILTER_CREATED]\n` +
                        `thirdparty=${competitorContext.competitorName}`
                    );
                } else {
                    console.log(
                        `[COMPETITOR_FILTER_SKIPPED] competitor=${competitorContext.competitorName} | ` +
                        `reason=already_present`
                    );
                }
            } else if (parsedQuestion.intent === "COMPETITOR_STRATEGY") {
                console.warn(
                    `[COMPETITOR_FALLBACK_GLOBAL] Competitive intent detected but no thirdparty match — ` +
                    `analytics will run on unscoped (global) data. question="${question.slice(0, 80)}"`
                );
            }

            console.log(`[MERGED_FILTERS]\n${JSON.stringify(parsedQuestion.filters, null, 2)}`);

            // ── Entity Existence Validation (recommendation-about-entity only) ─
            if (shouldValidateEntityExistence(question)) {
                const entityCheck = validateEntityExistence(parsedQuestion.filters, metadata);
                if (!entityCheck.valid) {
                    console.warn(`[ENTITY_NOT_FOUND] ${entityCheck.missingEntity}`);
                    throw new QuestionValidationError({
                        valid: false,
                        errors: [entityCheck.message ?? `Entity "${entityCheck.missingEntity}" not found in dataset.`],
                        suggestions: ["Verify the entity name matches your dataset.", "Try searching for available destinations, hotels, or suppliers."]
                    });
                }
            }

            const validation = validateQuestion(parsedQuestion, semanticLayer);

            if (!validation.valid) {
                throw new QuestionValidationError(validation);
            }

            console.log(`[VALIDATED_FILTERS]\n${JSON.stringify(parsedQuestion.filters, null, 2)}`);
            timer.checkpoint("Question analysis + validation");
            if (competitorContext) {
                const hasThirdparty = parsedQuestion.filters.some(f => f.dimension === "thirdparty");
                if (!hasThirdparty) {
                    throw new Error("COMPETITOR_FILTER_MISSING: Competitor analytics requested but competitor filter missing.");
                }
                console.log(`[RCA_FILTERS]\nthirdparty=${competitorContext.competitorName}`);
            }

            currentStage = "Route Decision";
            // ── 3. Route Decision ──────────────────────────────────────────────
            let sql = "";
            let explanation = "";

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
                //
                // V5.5: COMPETITOR_STRATEGY is NOW also overridden to ROOT_CAUSE
                // when a competitor is detected AND the query is recommendation/narrative.
                // This ensures competitor queries run multi-dimensional RCA instead
                // of the simple APW-gap analysis, producing differentiated results.
                const shouldOverrideCompetitor = competitorContext && (isRecommendation || isNarrative) && routeType === "COMPETITOR_STRATEGY";
                const packRoutes = new Set(["ROOT_CAUSE", "EXECUTIVE_PRIORITY", "COMPARE_ENTITIES"]);
                if ((isRecommendation || isNarrative) && !packRoutes.has(routeType) && routeType !== "LLM" && (!routeType.includes("COMPETITOR") || shouldOverrideCompetitor)) {
                    console.log(
                        `[PRE_ROUTER] ${isRecommendation ? "Recommendation" : "Narrative"} query detected — ` +
                        `overriding route from ${routeType} to ROOT_CAUSE` +
                        (shouldOverrideCompetitor ? ` (competitor=${competitorContext!.competitorName})` : "")
                    );
                    routeType = "ROOT_CAUSE";
                }

                // Executive priority queries always use EXECUTIVE_PRIORITY route
                if (isExecutivePriorityQuestion(question) || parsedQuestion.intent === "EXECUTIVE_PRIORITY") {
                    if (routeType !== "EXECUTIVE_PRIORITY") {
                        console.log(`[PRE_ROUTER] Executive priority query — overriding route from ${routeType} to EXECUTIVE_PRIORITY`);
                    }
                    routeType = "EXECUTIVE_PRIORITY";
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

                // ── COMPARE_ENTITIES ───────────────────────────────────────────
                else if (routeType === "COMPARE_ENTITIES") {
                    explanation = "Entity comparison pack will be built after validation.";
                }

                // ── EXECUTIVE_PRIORITY ─────────────────────────────────────────
                else if (routeType === "EXECUTIVE_PRIORITY") {
                    explanation = "Executive priority pack will be built from multi-dimensional contribution analysis.";
                }

                // ── COMPETITOR STRATEGY ────────────────────────────────────────
                else if (routeType === "COMPETITOR_STRATEGY") {
                    const result = generateCompetitorStrategySql(parsedQuestion, semanticLayer);
                    if (result) {
                        sql = result.sql;
                        explanation = result.explanation;
                    } else {
                        console.warn("[ORCHESTRATOR] Competitor strategy engine returned null — falling back to LLM.");
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
                    let availableDims = ["hotel", "chain", "supplier", "apw"].filter(dim => 
                        semanticLayer.dimensions.some(d => d.toLowerCase() === dim.toLowerCase())
                    );
                    
                    if (parsedQuestion.dimensions.length > 0) {
                        const requestedDims = availableDims.filter(dim => 
                            parsedQuestion.dimensions.some(pd => pd.toLowerCase() === dim.toLowerCase())
                        );
                        if (requestedDims.length > 0) {
                            availableDims = requestedDims;
                        }
                    }
                    
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
                if (sql && routeType !== "ROOT_CAUSE" && routeType !== "EXECUTIVE_PRIORITY" && routeType !== "COMPARE_ENTITIES") {
                    await setCachedSql(semanticLayer.datasetType, question.toLowerCase().trim(), sql);
                }
            }
            timer.checkpoint("Routing + SQL generation");
            console.log("[FINAL_SQL]\n", sql);

            // ── SQL Trace Logging for Competitor Filter ────────────────────────
            if (competitorContext) {
                const lowerSql = sql.toLowerCase();
                if (!lowerSql.includes("thirdparty")) {
                    throw new Error("COMPETITOR_SQL_FILTER_MISSING");
                }
                console.log(`[SQL_FILTERS]\nthirdparty=${competitorContext.competitorName}`);
            }

            currentStage = "SQL Execution";
            // ── 4. SQL Validation & Execution ──────────────────────────────────
            let queryResultsList: Record<string, unknown>[][] = [];
            let queryResults: Record<string, unknown>[] = [];
            
            if (routeType === "ROOT_CAUSE") {
                const sqlStatements = sql.split("\n---\n");

                queryResultsList = await Promise.all(
                    sqlStatements.map(async (statement) => {
                        try {
                            return await executeQuery(statement, tempPath);
                        } catch (err) {
                            console.warn("[ROOT_CAUSE_QUERY_FAILED]", err);
                            return [];
                        }
                    })
                );

                // Deterministic: pick the first non-empty dimension result set for downstream insights
                queryResults = queryResultsList.find(res => res.length > 0) || [];
            } else if (routeType === "EXECUTIVE_PRIORITY" || routeType === "COMPARE_ENTITIES") {
                // SQL executed during pack building for these routes
            } else if (sql) {
                const sqlValidation = await validateSqlSyntax(sql, tempPath);
                if (!sqlValidation.valid) {
                    throw new Error(`Generated SQL failed validation: ${sqlValidation.error}`);
                }
                queryResults = await executeQuery(sql, tempPath);
            }

            const totalFetchedRows = (routeType === "ROOT_CAUSE" || routeType === "EXECUTIVE_PRIORITY")
                ? queryResultsList.reduce((acc, res) => acc + res.length, 0)
                : queryResults.length;

            console.log(`[ROW_COUNT]\nrows=${totalFetchedRows}`);
            timer.checkpoint("DuckDB execution");
            if (competitorContext && totalFetchedRows === 0) {
                console.log(
                    `[COMPETITOR_FILTER_EMPTY]\ncompetitor=${competitorContext.competitorName}\nsql=${sql}\nrowCount=0`
                );
                throw new Error("COMPETITOR_FILTER_EMPTY: Competitor query returned 0 rows. No silent fallback allowed.");
            }

            currentStage = "Pack Building";
            // ── 5. Pack Building ───────────────────────────────────────────────
            let rootCausePack = null;
            let executivePack = null;
            let comparisonPackResult = null;

            if (routeType === "EXECUTIVE_PRIORITY") {
                const priorityResult = await runExecutivePriorityPipeline(
                    question,
                    parsedQuestion,
                    semanticLayer,
                    tempPath,
                    competitorContext || undefined
                );
                sql = priorityResult.sql;
                explanation = priorityResult.explanation;
                queryResultsList = priorityResult.queryResultsList;
                queryResults = queryResultsList.find(r => r.length > 0) || [];
                rootCausePack = priorityResult.rootCausePack;
                executivePack = priorityResult.executivePack;
                console.log("[ORCHESTRATOR] Executive priority pack built");
            } else if (routeType === "COMPARE_ENTITIES") {
                const entities = extractComparisonEntities(parsedQuestion, semanticLayer);
                if (!entities) {
                    throw new QuestionValidationError({
                        valid: false,
                        errors: ["Could not identify two entities to compare."],
                        suggestions: ["Try: 'Compare TripJack and Otilla' with both names spelled as they appear in your data."]
                    });
                }
                comparisonPackResult = await buildComparisonPack(
                    entities.left,
                    entities.right,
                    entities.dimension,
                    entities.physicalCol,
                    semanticLayer,
                    tempPath
                );
                rootCausePack = {
                    metricName: comparisonPackResult.metricName,
                    metricChange: null,
                    topPositiveContributors: [],
                    topNegativeContributors: [],
                    priorityDrivers: [],
                    risks: [],
                    opportunities: [],
                    affectedHotels: [],
                    affectedChains: [],
                    affectedSuppliers: [],
                    affectedAPWBuckets: [],
                    trendSummary: [],
                    totalRows: comparisonPackResult.entities.reduce((s, e) => s + e.volume, 0),
                    builtAt: new Date().toISOString()
                } as any;
                executivePack = {
                    headline: `Comparison: ${entities.left} vs ${entities.right}`,
                    executiveSummary: formatComparisonNarrative(comparisonPackResult),
                    keyTakeaway: comparisonPackResult.recommendedAction,
                    topDrivers: [],
                    topRisks: [],
                    topOpportunities: [],
                    recommendedFocusAreas: comparisonPackResult.focusAreas,
                    topActions: [comparisonPackResult.recommendedAction],
                    strategicImplications: [],
                    scenarios: [],
                    actionImpacts: [],
                    tradeoffs: [],
                    dependencies: [],
                    confidenceAssessment: { rationale: "Based on side-by-side entity comparison.", confidence: "HIGH" },
                    leadershipMessage: `Winner: ${comparisonPackResult.winner}. Focus on ${comparisonPackResult.loser}.`,
                    comparisonPack: comparisonPackResult
                } as any;
                console.log("[ORCHESTRATOR] Comparison pack built");
            } else if (routeType === "ROOT_CAUSE") {
                rootCausePack = buildRootCausePack(question, semanticLayer, queryResultsList, competitorContext || undefined);
                console.log("[ORCHESTRATOR] Root cause pack built");

                const { executeEntityDrilldown } = await import("./insights/entityDrilldownEngine.js");
                const { generateAttributedRecommendations } = await import("./insights/recommendationAttributionEngine.js");

                const drilldowns = await executeEntityDrilldown(
                    rootCausePack.primaryTarget,
                    parsedQuestion,
                    semanticLayer,
                    tempPath,
                    competitorContext || undefined
                );
                rootCausePack.drilldowns = drilldowns;
                rootCausePack.recommendations = generateAttributedRecommendations(
                    rootCausePack.primaryTarget,
                    drilldowns,
                    competitorContext || undefined
                );

                executivePack = buildExecutivePack(rootCausePack, competitorContext || undefined);
                console.log("[EXECUTIVE_PACK]", JSON.stringify(executivePack, null, 2));
            } else if (routeType === "COMPETITOR_STRATEGY") {
                // Map the competitor SQL output to CompetitiveGap objects
                const competitiveGaps = queryResults.map(r => ({
                    dimension: String(r["Segment"] || "Unknown"),
                    ourMetric: Number(r[`Our ${semanticLayer.metrics[0]?.name || "Win Rate"}`] || 0),
                    competitorMetric: Number(r[`Competitor ${semanticLayer.metrics[0]?.name || "Win Rate"}`] || 0),
                    gap: Number(r["Gap"] || 0),
                    recommendation: `Target ${r["Segment"]} to close gap of ${r["Gap"]} points.`
                }));

                console.log(`[ORCHESTRATOR] COMPETITOR_STRATEGY parsed ${competitiveGaps.length} gaps.`);

                // Construct a primaryTarget based on the largest competitive vulnerability
                let compPrimaryTarget: any = undefined;
                let drilldowns: any[] = [];
                let recommendations: any[] = [];
                
                if (competitiveGaps.length > 0) {
                    const topGap = competitiveGaps[0];
                    compPrimaryTarget = {
                        entityType: "APW", // We assume Segment/APW for now
                        name: topGap.dimension,
                        volumeShare: topGap.gap, // proxy
                        metricDelta: -Math.abs(topGap.gap),
                        impactScore: -Math.abs(topGap.gap),
                        actionabilityScore: Math.abs(topGap.gap),
                        resourceAllocationScore: Math.abs(topGap.gap),
                        polarity: TargetPolarity.RISK,
                        reason: `Largest competitive vulnerability (Gap: ${topGap.gap.toFixed(2)} percentage points)`
                        ,selectionRationale: `Selected because closing ${topGap.dimension} creates the largest competitive defense opportunity.`
                    };

                    const metricName = semanticLayer.metrics[0]?.name || "Win Rate";
                    drilldowns = await executeEntityDrilldown(compPrimaryTarget, parsedQuestion, semanticLayer, tempPath, metricName);
                    recommendations = generateAttributedRecommendations(compPrimaryTarget, drilldowns, undefined, metricName);
                }

                executivePack = {
                    headline: "Competitive Strategy Analysis",
                    executiveSummary: "Competitor analysis identified key performance gaps.",
                    keyTakeaway: "Target segments with largest competitive disadvantage.",
                    topDrivers: [],
                    topRisks: [],
                    topOpportunities: [],
                    recommendedFocusAreas: [],
                    topActions: [],
                    strategicImplications: [] as any,
                    scenarios: [],
                    actionImpacts: [],
                    tradeoffs: [],
                    dependencies: [],
                    confidenceAssessment: { rationale: "Based on competitor comparison.", confidence: "HIGH" },
                    leadershipMessage: "Focus on closing competitive gaps.",
                    actionabilityTargets: compPrimaryTarget ? [compPrimaryTarget] : [],
                    primaryTarget: compPrimaryTarget,
                    drilldowns,
                    recommendations,
                    competitiveGaps
                };
                
                // We fake a minimal rootCausePack so buildClaudeInputPack doesn't crash
                rootCausePack = {
                    metricName: semanticLayer.metrics[0]?.name || "Metric",
                    metricChange: null,
                    contradictionDetected: false,
                    validationErrors: [],
                    totalRows: queryResults.length,
                    builtAt: new Date().toISOString()
                } as any;
            }

            // Phase 7: Assertions
            if (routeType === "COMPETITOR_STRATEGY") {
                if (!executivePack?.competitiveGaps || executivePack.competitiveGaps.length === 0) {
                    console.error("[ASSERT_FAILED] route=COMPETITOR_STRATEGY but competitiveGaps is empty.");
                    throw new QuestionValidationError({
                        valid: false,
                        errors: ["No competitive gaps could be identified. The specified competitor may not have overlapping segments with your baseline data."],
                        suggestions: ["Try comparing against a different competitor.", "Check if the competitor name is spelled correctly."]
                    });
                }
            }
            if (isRecommendation && routeType === "ROOT_CAUSE") {
                const guardrail = validateRecommendationGuardrails(executivePack, {
                    requirePrimaryTarget: true,
                    requireRecommendations: false
                });

                if (!guardrail.allowed) {
                    console.warn(`[RECOMMENDATION_GUARDRAIL] blocked: ${guardrail.reason}`);
                    throw new QuestionValidationError({
                        valid: false,
                        errors: [guardrail.safeExplanation ?? "Insufficient signal for recommendations."],
                        suggestions: ["Try a more specific question with a clear metric or segment."]
                    });
                }

                if (executivePack?.primaryTarget) {
                    if (isNegativeIntent(question) && executivePack.primaryTarget.impactScore > 0) {
                        console.error("[ASSERT_FAILED] Negative intent but selected target has positive impact.");
                        throw new QuestionValidationError({
                            valid: false,
                            errors: ["Could not identify a negative performer matching your criteria."],
                            suggestions: ["Try looking at a different dimension."]
                        });
                    }

                    if (isPositiveIntent(question) && executivePack.primaryTarget.impactScore <= 0) {
                        console.error("[ASSERT_FAILED] Positive intent but selected target has negative impact.");
                        throw new QuestionValidationError({
                            valid: false,
                            errors: ["Could not identify a positive performer matching your criteria."],
                            suggestions: ["Try looking at a different dimension."]
                        });
                    }
                }
            }
            timer.checkpoint("Executive Pack");
            currentStage = "Claude Input Pack";
            // ── 6. Classify response source ───────────────────────────────
            let responseSource: ResponseSource = "ANALYTICS";
            let claudeInputPack = null;
            let recommendations = null;

            if ((routeType === "ROOT_CAUSE" || routeType === "EXECUTIVE_PRIORITY" || routeType === "COMPETITOR_STRATEGY") && rootCausePack && executivePack) {
                responseSource = classifyResponseSource(question);
                claudeInputPack = buildClaudeInputPack(
                    question,
                    rootCausePack,
                    executivePack,
                    competitorContext?.competitorName
                );
                if (competitorContext) {
                    console.log(
                        `[COMPETITOR_RCA] competitor=${competitorContext.competitorName} | ` +
                        `primaryTarget=${executivePack.primaryTarget?.name ?? "none"} | ` +
                        `drilldowns=${executivePack.drilldowns?.length ?? 0} | ` +
                        `recommendations=${executivePack.recommendations?.length ?? 0}`
                    );
                }
            }

            console.log(`[CLASSIFIER] responseSource=${responseSource} | isRecommendation=${isRecommendation} | isNarrative=${isNarrative}`);

            console.log(`[ROUTE_DECISION] routeType=${routeType} | responseSource=${responseSource} | hasRootCausePack=${!!rootCausePack} | hasClaudeInputPack=${!!claudeInputPack}`);
            timer.checkpoint("Prompt Assembly");
            if (rootCausePack?.contradictionDetected) {
                recordContradiction();
            }

            currentStage = "Claude Response";
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
                        const claudeStart = performance.now();
                        const recResult = await generateRecommendations(claudeInputPack);
                        logger.info({
    durationMs: Math.round(performance.now() - claudeStart)
}, "Claude Recommendation");
                        console.log(`🔥 SONNET_RETURNED`);
                        console.log(`[ROUTE_CLAUDE_OUTPUT] tier=${routerDecision.tier} | operation=${routerDecision.operation} | shouldCallClaude=${routerDecision.shouldCallClaude}`);
                        recommendations = recResult.recommendations;

                        console.log(`[CLAUDE_RESPONSE] recommendations=${recommendations.length} | claudeUsed=${recResult.claudeUsed} | claudeFailed=${recResult.claudeFailed} | rawClaudeChars=${recResult.rawClaudeText?.length ?? 0}`);

                        // ── CRITICAL FIX: Return raw Sonnet output directly ──────
                        // When Claude Sonnet was used successfully, return its raw
                        // Decision Intelligence Brief as-is. Do NOT rebuild from
                        // parsed Recommendation[] objects — the parser uses
                        // ACTION:/RATIONALE:/EVIDENCE:/IMPACT: delimiters that don't
                        // match Sonnet's TARGET-FIRST format, causing truncation
                        // from ~4672 chars to ~340 chars.
                        if (recResult.claudeUsed && recResult.rawClaudeText) {
                            narrative = recResult.rawClaudeText;
                            console.log(`[NARRATIVE_VALUE_SET] source=CLAUDE_RECOMMENDATION | generator=RAW_SONNET_TEXT | chars=${narrative.length} | preview="${narrative.slice(0, 120)}"`);
                        } else {
                            // Deterministic fallback: rebuild from structured objects
                            narrative = buildRecommendationNarrative(recommendations, claudeInputPack);
                            console.log(`[NARRATIVE_VALUE_SET] source=CLAUDE_RECOMMENDATION | generator=buildRecommendationNarrative (deterministic) | chars=${narrative.length} | preview="${narrative.slice(0, 120)}"`);
                        }

                        // Phase 8: Response Validation
                        const textLower = narrative.toLowerCase();
                        const legacyEntities = ["hilton", "premier inn", "31-45 days", "46-60 days"];
                        const hasLegacyEntities = legacyEntities.some(e => textLower.includes(e));

                        const validTargets = [
                            ...(executivePack.recommendations || []).map((r: { targetName: string }) => r.targetName.toLowerCase()),
                            ...(executivePack.competitiveGaps || []).map((g: { dimension: string }) => g.dimension.toLowerCase()),
                            executivePack.primaryTarget?.name.toLowerCase()
                        ].filter(Boolean) as string[];

                        const explicitlyLinksTargets = validTargets.some(t => textLower.includes(t));

                        if (hasLegacyEntities && !explicitlyLinksTargets) {
                            console.error("[VALIDATION_FAILED] Claude generated legacy entities without explicit linkage to V4 targets.");
                            throw new Error("InvalidRecommendationError: Generated response bypassed V4 targets and hallucinated legacy entities.");
                        }
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
                        const claudeStart = performance.now();
                        const narResult = await (opts?.onClaudeToken
                            ? generateNarrativeStream(claudeInputPack, {
                                onToken: opts.onClaudeToken,
                                abortSignal: opts.abortSignal
                            })
                            : generateNarrative(claudeInputPack)
                        );
                        logger.info({
                        durationMs: Math.round(performance.now() - claudeStart)
                        }, "Claude Narrative");
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
                } else if (routeType === "COMPARE_ENTITIES" && comparisonPackResult) {
                    console.log(`[NARRATIVE_REQUEST] source=COMPARE_ENTITIES | deterministic comparison`);
                    narrative = formatComparisonNarrative(comparisonPackResult);
                    console.log(`[NARRATIVE_VALUE_SET] source=COMPARE_ENTITIES | preview="${narrative.slice(0, 100)}"`);
                } else if (routeType === "EXECUTIVE_PRIORITY" && executivePack) {
                    console.log(`[NARRATIVE_REQUEST] source=EXECUTIVE_PRIORITY | deterministic executive brief`);
                    narrative = buildExecutivePriorityNarrative(executivePack);
                    validateExecutivePriorityNarrative(executivePack, narrative, question);
                    console.log(`[NARRATIVE_VALUE_SET] source=EXECUTIVE_PRIORITY | preview="${narrative.slice(0, 100)}"`);
                } else {
                    console.log(`[NARRATIVE_REQUEST] source=ANALYTICS | deterministic`);
                    narrative = buildDeterministicNarrative(question, queryResults, extractInsights(queryResults));
                    console.log(`[NARRATIVE_VALUE_SET] source=ANALYTICS | preview="${narrative.slice(0, 100)}"`);
                }
                timer.checkpoint("Narrative Generation");
                await setCachedNarrative(datasetId, question.toLowerCase().trim(), sql, narrative, responseSource);
            }

            // ── 8. Record metrics ─────────────────────────────────────────────
            const totalLatency = pipelineTimer.stop();
            recordQuery(routeType, totalLatency);

            console.log(
                `[PIPELINE_COMPLETE] route=${routeType} | responseSource=${responseSource} | ` +
                `latency=${totalLatency}ms | narrativeChars=${narrative.length} | ` +
                `recommendations=${recommendations?.length ?? 0}` +
                (competitorContext ? ` | competitor=${competitorContext.competitorName}` : "")
            );

            console.log(
                `[RETURN_PATH] MAIN_RETURN | responseSource=${responseSource} | ` +
                `answerPreview="${narrative.slice(0, 120)}" | ` +
                `recommendations=${recommendations?.length ?? 0}`
            );

            // ── 9. Return payload ──────────────────────────────────────────────
            timer.finish();
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
                ...(competitorContext ? { competitorName: competitorContext.competitorName } : {}),
                parsedQuestion: {
                    intent: parsedQuestion.intent,
                    metrics: parsedQuestion.metrics,
                    dimensions: parsedQuestion.dimensions,
                    timeReferences: parsedQuestion.timeReferences
                }
            };

        } catch (err: any) {
            if (err instanceof QuestionValidationError) {
                timer.finish();
                throw err;
            }
            console.error(`[PIPELINE_FATAL] question="${question}" | intent=${parsedIntent} | route=${routeType || "Unknown"} | stage=${currentStage} | error=${err.message}`);
            console.error(err.stack);
            err.message = `[Stage: ${currentStage}] ` + err.message;
            timer.finish();
            throw err;
        } finally {
            if (tempPath) {
                // Clean up downloaded dataset (retry on Windows EBUSY)
                const fs = await import("fs/promises");
                for (let i = 0; i < 50; i++) {
                    try {
                        // Temporarily disabled to prevent local Supabase credential requirements
                        // await fs.unlink(tempPath);
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

function buildExecutivePriorityNarrative(executivePack: any): string {
    const target = executivePack.primaryTarget;
    const decisionBrief = executivePack.decisionBrief;
    const drivers = (executivePack.topDrivers ?? []).slice(0, 3).map((d: any) => d.name).join(", ");
    const actions = (executivePack.topActions ?? []).slice(0, 3).map((action: any, index: number) => {
        if (typeof action === "string") {
            return `${index + 1}. ${action}`;
        }
        const actionText = action.action ?? action.title ?? String(action);
        const rationaleText = action.rationale ? `\n   Why: ${action.rationale}` : "";
        const impactText = action.expectedImpact ? `\n   Impact: ${action.expectedImpact}` : "";
        return `${index + 1}. ${actionText}${rationaleText}${impactText}`;
    }).join("\n");

    const alternatives = (decisionBrief?.alternatives ?? []).slice(0, 3).map((alt: any) => {
        return `- ${alt.name}: ${alt.reason} (score ${Number(alt.resourceAllocationScore).toFixed(2)})`;
    }).join("\n");

    if (!target) {
        return executivePack.executiveSummary || executivePack.leadershipMessage || "Insufficient data to identify a primary focus area.";
    }

    const polarityLabel = target.polarity || (target.impactScore < 0 ? TargetPolarity.NEGATIVE : TargetPolarity.POSITIVE);

    const polarityAction = polarityLabel === TargetPolarity.RISK
        ? "de-risk"
        : polarityLabel === TargetPolarity.NEGATIVE
            ? "recover"
            : "scale";

    return [
        `## Executive Priority Brief`,
        ``,
        `**Primary Target:** ${target.name} (${target.entityType})`,
        `**Polarity:** ${polarityLabel}`,
        `**Why this target?** ${target.selectionRationale || target.reason}`,
        `**Business Impact:** ${target.metricDelta?.toFixed?.(1) ?? target.metricDelta} point metric delta at ${target.volumeShare?.toFixed?.(1) ?? target.volumeShare}% volume`,
        `**Expected ROI:** Resource allocation score ${target.resourceAllocationScore?.toFixed?.(2) ?? target.resourceAllocationScore} — highest leverage intervention available`,
        ``,
        `**Why not alternatives?**`,
        alternatives || `- See ranked alternatives in the supporting analysis.`,
        ``,
        `**Top Drivers:** ${drivers || "See supporting analysis"}`,
        ``,
        `**Recommended Actions:**`,
        ...(actions ? actions.split("\n") : (executivePack.recommendedFocusAreas ?? []).slice(0, 3).map((a: string) => `- ${a}`)),
        ``,
        `**Leadership Message:** ${executivePack.leadershipMessage || executivePack.keyTakeaway || ""}`,
        `**Action Verb:** ${polarityAction}`
    ].filter(Boolean).join("\n");
}

function validateExecutivePriorityNarrative(executivePack: any, narrative: string, question: string): void {
    const target = executivePack?.primaryTarget;
    if (!target) {
        throw new Error("EXECUTIVE_PRIORITY_VALIDATION_FAILED");
    }

    const lower = narrative.toLowerCase();
    const leadershipMessage = String(executivePack.leadershipMessage || "").toLowerCase();
    if (lower.includes("[object object]")) {
        throw new Error("EXECUTIVE_PRIORITY_VALIDATION_FAILED");
    }

    const polarity = target.polarity || (target.impactScore < 0 ? TargetPolarity.NEGATIVE : TargetPolarity.POSITIVE);
    const positiveLanguage = /\b(scale|expand|replicate|invest|accelerate|grow|expand investment|scale up)\b/i;
    const negativeLanguage = /\b(recover|fix|investigate|stabilize|repair|mitigate|close|de-risk)\b/i;
    const riskLanguage = /\b(diversify|protect|de-risk|reduce dependency|defend)\b/i;

    if (polarity === TargetPolarity.POSITIVE && negativeLanguage.test(leadershipMessage) && !positiveLanguage.test(leadershipMessage)) {
        throw new Error("EXECUTIVE_PRIORITY_VALIDATION_FAILED");
    }

    if (polarity === TargetPolarity.NEGATIVE && positiveLanguage.test(leadershipMessage) && !negativeLanguage.test(leadershipMessage)) {
        throw new Error("EXECUTIVE_PRIORITY_VALIDATION_FAILED");
    }

    if (polarity === TargetPolarity.RISK && (positiveLanguage.test(leadershipMessage) || negativeLanguage.test(leadershipMessage)) && !riskLanguage.test(leadershipMessage)) {
        throw new Error("EXECUTIVE_PRIORITY_VALIDATION_FAILED");
    }

    const requiresRoiJustification = /allocate resources|highest roi|fastest win|what should we focus on first|where should i allocate resources/i.test(question);
    if (requiresRoiJustification && !/(roi|resource allocation score|why this target|selected because)/i.test(lower)) {
        throw new Error("EXECUTIVE_PRIORITY_VALIDATION_FAILED");
    }

    if (!/(why this target|why not alternatives|selected because)/i.test(lower)) {
        throw new Error("EXECUTIVE_PRIORITY_VALIDATION_FAILED");
    }
}
