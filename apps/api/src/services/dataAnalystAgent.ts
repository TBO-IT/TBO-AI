import { getAnthropicClient } from "../lib/claude.js";
import { MODELS } from "../config/models.js";
import { executeAgentSql } from "./queryExecutionService.js";
import { EnrichedSemanticLayer } from "../ai/semanticLayer.js";
import { logger } from "../lib/logger.js";
import { DatasetMetadata } from "./metadataService.js";
import { recordUsage } from "./tokenUsageService.js";
import { QuestionAnalysis } from "../ai/questionTypes.js";

export interface AgentResult {
    narrative: string;
    sql: string;
    explanation: string;
}

export async function runDataAnalystAgent(
    question: string,
    parsedQuestion: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer,
    metadata: DatasetMetadata,
    tempPath: string
): Promise<AgentResult> {
    const systemPrompt = `You are a Senior Data Analyst AI for an executive analytics platform.
You have access to a DuckDB dataset representing travel metrics (competitiveness, pricing, conversions).
The user is a senior executive asking a complex business question.

DATASET: data_table
AVAILABLE COLUMNS:
${semanticLayer.allColumns.map(c => `  "${c.column_name}" (${c.column_type})`).join("\n")}

You MUST use your tools to analyze the data and answer the question.
- Use 'execute_sql' to run DuckDB SQL queries against 'data_table' to investigate.
- If a query fails, read the error message, correct your SQL, and try again.
- You can run multiple queries to dig deeper if the first query results raise more questions.
- Once you have completely answered the executive's question, use 'submit_answer'.

IMPORTANT RULES:
1. Double-quote ALL column names with spaces or uppercase letters: e.g. "Competitive Status", "tbo_price".
2. When referencing the dataset, always use the literal table name "data_table".
3. Use NULLIF to protect against division by zero.
`;

    const tools = [
        {
            name: "execute_sql",
            description: "Run a DuckDB SQL query against the 'data_table' dataset.",
            input_schema: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The DuckDB SQL query to execute." }
                },
                required: ["query"]
            }
        },
        {
            name: "submit_answer",
            description: "Submit the final answer after you have gathered enough data.",
            input_schema: {
                type: "object",
                properties: {
                    narrative: { type: "string", description: "The detailed, business-focused executive summary based on the data." },
                    final_sql: { type: "string", description: "The single most important SQL query that backs up your narrative (or the final one you ran)." },
                    explanation: { type: "string", description: "A brief one-sentence explanation of what the final SQL query does." }
                },
                required: ["narrative", "final_sql", "explanation"]
            }
        }
    ];

    const messages: any[] = [{ role: "user", content: question }];
    const maxIterations = 3;

    for (let i = 0; i < maxIterations; i++) {
        console.log(`[AGENT] Iteration ${i + 1}/${maxIterations}`);
        
        const response = await getAnthropicClient().messages.create({
            model: MODELS.SONNET || "claude-3-5-sonnet-latest",
            max_tokens: 3000,
            temperature: 0.1,
            system: systemPrompt,
            messages,
            tools: tools as any
        });

        if (response.usage) {
            await recordUsage(MODELS.SONNET || "claude-3-5-sonnet-latest", "NARRATIVE_GENERATION", response.usage.input_tokens, response.usage.output_tokens);
        }

        messages.push({ role: "assistant", content: response.content });

        const toolCalls = response.content.filter((b: any) => b.type === "tool_use");
        if (toolCalls.length === 0) {
            return {
                narrative: response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n"),
                sql: "",
                explanation: "Agent finished without submitting an explicit answer."
            };
        }

        let submittedResult: AgentResult | null = null;
        const toolResponses = [];

        for (const toolBlock of toolCalls) {
            const toolName = (toolBlock as any).name;
            const input = (toolBlock as any).input;

            if (toolName === "submit_answer") {
                submittedResult = {
                    narrative: input.narrative,
                    sql: input.final_sql,
                    explanation: input.explanation
                };
                toolResponses.push({
                    type: "tool_result",
                    tool_use_id: (toolBlock as any).id,
                    content: "Answer submitted successfully."
                });
            } else if (toolName === "execute_sql") {
                try {
                    console.log(`[AGENT] Executing SQL:\n${input.query}`);
                    const rows = await executeAgentSql(input.query, tempPath);
                    const jsonString = JSON.stringify(rows, null, 2);
                    const truncated = jsonString.length > 8000 ? jsonString.substring(0, 8000) + "\n...[TRUNCATED]" : jsonString;
                    
                    toolResponses.push({
                        type: "tool_result",
                        tool_use_id: (toolBlock as any).id,
                        content: truncated
                    });
                } catch (err: any) {
                    console.warn(`[AGENT] SQL Execution Error: ${err.message}`);
                    toolResponses.push({
                        type: "tool_result",
                        tool_use_id: (toolBlock as any).id,
                        content: `Error executing query: ${err.message}`,
                        is_error: true
                    });
                }
            }
        }

        messages.push({ role: "user", content: toolResponses });

        if (submittedResult) {
            return submittedResult;
        }
    }

    return {
        narrative: "The AI analyst exhausted its query limit before arriving at a final conclusion.",
        sql: "",
        explanation: "Iteration limit reached."
    };
}
