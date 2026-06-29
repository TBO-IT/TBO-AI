import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});
const CLAUDE_MODEL = "claude-3-5-sonnet-20241022";
/**
 * Calls Claude to translate the user question and semantic prompt into DuckDB SQL.
 */
export async function generateSql(prompt) {
    try {
        const response = await anthropic.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 1500,
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0
        });
        const contentText = response.content.find(block => block.type === "text")?.text || "";
        // Parse JSON output from Claude
        let jsonStr = contentText.trim();
        if (jsonStr.includes("```json")) {
            jsonStr = jsonStr.substring(jsonStr.indexOf("```json") + 7);
            jsonStr = jsonStr.substring(0, jsonStr.lastIndexOf("```"));
        }
        else if (jsonStr.includes("```")) {
            jsonStr = jsonStr.substring(jsonStr.indexOf("```") + 3);
            jsonStr = jsonStr.substring(0, jsonStr.lastIndexOf("```"));
        }
        const parsed = JSON.parse(jsonStr.trim());
        if (parsed.sql && parsed.explanation) {
            return {
                explanation: parsed.explanation,
                sql: parsed.sql
            };
        }
        throw new Error("Missing sql or explanation in response JSON");
    }
    catch (error) {
        console.error("Error generating SQL with Claude:", error);
        throw new Error(`SQL generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Calls Claude to generate a natural, high-level business narrative explaining the SQL query results.
 */
export async function generateNarrative(question, sqlQuery, data) {
    const prompt = `You are a Principal Travel Analytics Insights Director. 
An executive asked the following business question:
"${question}"

To answer it, we executed this DuckDB SQL query:
\`\`\`sql
${sqlQuery}
\`\`\`

And retrieved these results:
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

Provide a high-quality, professional, and crisp Executive Narrative summarizing these findings.
Guidelines:
1. Explain the "why" and "so what" behind the data. Do not just read the table rows aloud. Highlight key patterns, drivers, and anomalies.
2. Present metrics in a senior-executive friendly format (e.g. percentages, rounded values, and formatted currencies where applicable).
3. Do NOT mention details of the database structure, JSON, or terms like "the table", "database query", or "DuckDB". Speak directly to the business facts.
4. Keep the narrative structured and scannable using brief bullet points and bolding for key callouts.
5. End with a 1-sentence actionable business takeaway or next step based on the data.
`;
    try {
        const response = await anthropic.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 1500,
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.3
        });
        return response.content.find(block => block.type === "text")?.text || "No narrative generated.";
    }
    catch (error) {
        console.error("Error generating narrative with Claude:", error);
        throw new Error(`Narrative generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
