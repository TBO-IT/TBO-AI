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
    const schemaDetails = semanticLayer.allColumns.map(c => `  "${c.column_name}" (${c.column_type})`).join("\n");

    // Build a compact column reference showing the most important semantics
    const schemaLower = semanticLayer.allColumns.map(c => c.column_name.toLowerCase());
    const hasCompetitiveStatus = schemaLower.some(c => c.includes("competitive") || c.includes("status"));
    const competitiveStatusNote = hasCompetitiveStatus
        ? `\n- "Competitive Status" column contains: 'Winning', 'Losing', 'Equal'`
        : "";
    const hasApw = schemaLower.some(c => c.includes("apw"));
    const apwNote = hasApw
        ? `\n- APW bucket column contains values like: '< 10 days', '11-30 days', '31-45 days', '46-60 days', '61-90 days', '90+ days'`
        : "";
    const hasPriceDiff = schemaLower.some(c => c.includes("price_diff"));
    const priceDiffNote = hasPriceDiff
        ? `\n- price_diff_perc: percentage difference between TBO price and competitor price. Negative = TBO is cheaper (good). Positive = TBO is more expensive (losing).`
        : "";
    const hotelCol = semanticLayer.allColumns.find(c => c.column_name.toLowerCase().includes("tbo_hotelname") || c.column_name.toLowerCase().includes("hotelname"))?.column_name || "tbo_hotelname";
    const chainCol = semanticLayer.allColumns.find(c => c.column_name.toLowerCase().includes("chainname") || c.column_name.toLowerCase().includes("chain"))?.column_name || "tbo_chainname";
    const destCol = semanticLayer.allColumns.find(c => c.column_name.toLowerCase() === "destination" || c.column_name.toLowerCase().includes("destination"))?.column_name || "destination";
    const supplierCol = semanticLayer.allColumns.find(c => c.column_name.toLowerCase().includes("thirdparty") && !c.column_name.toLowerCase().includes("price") && !c.column_name.toLowerCase().includes("hotel"))?.column_name || "thirdparty";
    const apwCol = semanticLayer.allColumns.find(c => c.column_name.toLowerCase().includes("apw"))?.column_name || "apw_bucket_new";
    const statusCol = semanticLayer.allColumns.find(c => c.column_name.toLowerCase().includes("competitive") || c.column_name.toLowerCase().includes("status"))?.column_name || "Competitive Status";
    const priceDiffCol = semanticLayer.allColumns.find(c => c.column_name.toLowerCase().includes("price_diff"))?.column_name || "price_diff_perc";

    const systemPrompt = `You are a Senior Data Analyst AI for an executive travel analytics platform.
You answer complex business questions by running DuckDB SQL queries against a competitiveness dataset.

DATASET TABLE: data_table
COLUMNS:
${schemaDetails}

KEY COLUMN SEMANTICS:
- "${destCol}": Destination/city name (e.g. 'Dubai', 'Bangkok', 'Pattaya')
- "${hotelCol}": TBO hotel name
- "${chainCol}": Hotel chain name (e.g. 'Marriott', 'Hilton')
- "${supplierCol}": Competitor/third-party OTA name (e.g. 'Booking.com', 'Expedia')
- "${apwCol}": Advance Purchase Window bucket${apwNote}
- "${statusCol}": Competitive status${competitiveStatusNote}${priceDiffNote}

WIN RATE FORMULA:
Win rate = percentage of rows where "Competitive Status" = 'Winning'.
SQL: COUNT(CASE WHEN "${statusCol}" ILIKE 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS win_rate_pct

PRICE ADVANTAGE FORMULA:
AVG("${priceDiffCol}") — negative means TBO is cheaper (competitive advantage), positive means TBO is more expensive.

CRITICAL SQL RULES:
1. ALWAYS double-quote column names that have spaces or mixed case: e.g. "Competitive Status", "tbo_hotelname".
2. Use ILIKE for all string comparisons (case-insensitive): WHERE "${destCol}" ILIKE '%Dubai%'
3. Use NULLIF to prevent division by zero.
4. Table name is always "data_table" (no schema prefix).
5. For "losing" destinations/hotels: WHERE "${statusCol}" ILIKE 'Losing'
6. For APW filters: WHERE "${apwCol}" = '31-45 days' (exact bucket string, not a number)

MULTI-PART QUESTION STRATEGY:
If the question has multiple sub-questions (e.g. "worst hotels AND worst APW AND worst competitor"), run SEPARATE SQL queries for each sub-question rather than one mega-query. Present all findings in a single cohesive narrative.

Example patterns:
- Worst hotels in losing destinations → SELECT "${hotelCol}", COUNT(*) as total, AVG("${priceDiffCol}") as avg_price_diff FROM data_table WHERE "${statusCol}" ILIKE 'Losing' GROUP BY "${hotelCol}" ORDER BY avg_price_diff DESC LIMIT 10
- APW with most losing rows → SELECT "${apwCol}", COUNT(*) as losing_count FROM data_table WHERE "${statusCol}" ILIKE 'Losing' GROUP BY "${apwCol}" ORDER BY losing_count DESC LIMIT 5  
- Competitor hurting most → SELECT "${supplierCol}", COUNT(*) as head_to_head_losses, AVG("${priceDiffCol}") as avg_price_gap FROM data_table WHERE "${statusCol}" ILIKE 'Losing' GROUP BY "${supplierCol}" ORDER BY head_to_head_losses DESC LIMIT 5

RESPONSE FORMAT:
Structure your final answer as a clear executive report with:
- Bold headers for each sub-question answered
- Key numbers highlighted
- Actionable recommendations at the end
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
            description: "Submit the final answer after you have gathered enough data or if the question is unanswerable.",
            input_schema: {
                type: "object",
                properties: {
                    narrative: { type: "string", description: "The detailed, business-focused executive summary based on the data." },
                    final_sql: { type: "string", description: "The single most important SQL query that backs up your narrative (or the final one you ran). Leave empty if no query was needed." },
                    explanation: { type: "string", description: "A brief one-sentence explanation of what the final SQL query does." }
                },
                required: ["narrative", "final_sql", "explanation"]
            }
        }
    ];

    const messages: any[] = [{ role: "user", content: question }];
    const maxIterations = 8;

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
