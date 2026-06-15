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

export class ChatOrchestrator {
    static async execute(datasetId: string, question: string): Promise<any> {

        // 1. Fetch Dataset & Schema
        const dataset = await getDataset(datasetId);
        if (!dataset || !dataset.storagePath) {
            throw new Error("Dataset not found or does not have a storage path.");
        }

        const tempPath = await downloadDataset(dataset.storagePath);

        try {
            const schema = await getDatasetSchema(tempPath);
            console.log(`[SCHEMA_COLUMNS] (${schema.length} cols):`, schema.map(c => `${c.column_name}(${c.column_type})`).join(" | "));

            const semanticLayer = buildSemanticLayer(schema);
            console.log(`[SEMANTIC_LAYER] type=${semanticLayer.datasetType} | dims=[${semanticLayer.dimensions.join(", ")}] | mappings=${JSON.stringify(semanticLayer.columnMappings)}`);

            // 2. Question Intelligence Gate
            const parsedQuestion = analyzeQuestion(question);
            const validation = validateQuestion(parsedQuestion, semanticLayer);

            if (!validation.valid) {
                throw new QuestionValidationError(validation);
            }

            // 3. Query Router & SQL Generation Cache
            let sql = "";
            let explanation = "";

            // Check SQL Cache first
            const cachedSql = await getCachedSql(semanticLayer.datasetType, question.toLowerCase().trim());

            if (cachedSql) {
                sql = cachedSql;
                explanation = "Retrieved from SQL cache.";
            } else {
                // Route query
                const routing = routeQuery(parsedQuestion, semanticLayer);

                console.log(
                    "QUESTION:",
                    question
                );

                console.log(
                    "PARSED:",
                    JSON.stringify(
                        parsedQuestion,
                        null,
                        2
                    )
                );

                console.log(
                    "ROUTING:",
                    JSON.stringify(
                        routing,
                        null,
                        2
                    )
                );


                if (routing.route === "TEMPLATE") {
                    sql = routing.sql;
                    explanation = routing.explanation;
                } else {
                    // SAFETY GUARD
                    // Check if intent should have been served by TEMPLATE
                    const templateIntents = ["SUMMARY", "RANKING", "BREAKDOWN", "COMPARISON"];
                    if (templateIntents.includes(parsedQuestion.intent)) {
                        throw new Error(`Safety Guard: Attempted Claude call for deterministic template question. Intent: ${parsedQuestion.intent}`);
                    }

                    // Call Claude for SQL Generation
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

                // Save to SQL cache
                await setCachedSql(semanticLayer.datasetType, question.toLowerCase().trim(), sql);
            }
            console.log("PARSED:", parsedQuestion);

            console.log(
                "SEMANTIC DIMENSIONS:",
                semanticLayer.dimensions
            );

            console.log(
                "COLUMN MAPPINGS:",
                semanticLayer.columnMappings
            );

            // 4. SQL Validation & Execution
            const sqlValidation = await validateSqlSyntax(sql, tempPath);
            if (!sqlValidation.valid) {
                throw new Error(`Generated SQL failed validation: ${sqlValidation.error}`);
            }

            const queryResults = await executeQuery(sql, tempPath);

            // 5. Narrative Cache & Generation
            let narrative = "";
            const cachedNarrative = await getCachedNarrative(datasetId, question.toLowerCase().trim(), sql);

            if (cachedNarrative) {
                narrative = cachedNarrative;
            } else {
                // 6. Result Compression & Insight Engine
                const summaryJson = summarizeResults(queryResults);
                const insights = extractInsights(queryResults);

                // Check if this was a simple intent. If so, generate deterministic narrative.
                const templateIntents = ["SUMMARY", "RANKING", "BREAKDOWN", "COMPARISON"];
                const isTemplate = templateIntents.includes(parsedQuestion.intent);

                if (isTemplate) {
                    if (queryResults && queryResults.length === 1) {
                        const row = queryResults[0];
                        const facts = Object.entries(row).map(([k, v]) => {
                            let formatted = v;
                            if (typeof v === "number") {
                                formatted = Number.isInteger(v) ? v.toString() : v.toFixed(2);
                            }
                            return `- **${k}**: ${formatted}`;
                        }).join("\n");
                        narrative = `Based on the data, here is the summary for your query:\n\n${facts}`;
                    } else if (queryResults && queryResults.length > 1) {
                        narrative = `Here are the top results for your query: "${question}".\n\n`;

                        const topRows = queryResults.slice(0, 5).map((row, idx) => {
                            const entries = Object.entries(row).map(([k, v]) => {
                                let formatted = v;
                                if (typeof v === "number") {
                                    formatted = Number.isInteger(v) ? v.toString() : v.toFixed(2);
                                }
                                return `${k}: ${formatted}`;
                            });
                            return `${idx + 1}. ${entries.join(" | ")}`;
                        }).join("\n");

                        narrative += `${topRows}\n`;

                        if (insights.length > 0 && insights[0] !== "No data available for insights.") {
                            narrative += `\n**Key Observations:**\n` + insights.map(i => `- ${i}`).join("\n");
                        }
                    } else {
                        narrative = "No data found for this query.";
                    }

                    await setCachedNarrative(datasetId, question.toLowerCase().trim(), sql, narrative);
                } else {
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
                    await setCachedNarrative(datasetId, question.toLowerCase().trim(), sql, narrative);
                }
            }

            // 7. Return payload
            return {
                answer: narrative,
                sql,
                explanation,
                results: queryResults,
                datasetType: semanticLayer.datasetType,
                parsedQuestion: {
                    intent: parsedQuestion.intent,
                    metrics: parsedQuestion.metrics,
                    dimensions: parsedQuestion.dimensions,
                    timeReferences: parsedQuestion.timeReferences
                }
            };

        } finally {
            // Clean up downloaded dataset
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
