import { DatasetColumn } from "./llmtypes.js";
import { EnrichedSemanticLayer } from "./semanticLayer.js";
import { BUSINESS_KNOWLEDGE } from "./businessKnowledge.js";

export function buildPrompt(
    question: string,
    semanticLayer: EnrichedSemanticLayer
): string {
    const { datasetType, dimensions, primaryTimeDimension, columnMappings, businessDefinitions, metrics, allColumns } = semanticLayer;

    // Format the columns schema
    const schemaDetails = allColumns
        .map(col => `  - "${col.column_name}" (${col.column_type})`)
        .join("\n");

    // Format business dimensions definitions
    const businessConceptsDetails = businessDefinitions
        .map(def => `  - ${def.name}: ${def.definition}`)
        .join("\n");

    // Format metric formulas
    const metricsDetails = metrics
        .map(m => `  - ${m.name} (${m.description}):\n    Formula: ${m.formula}`)
        .join("\n");

    // Format time intelligence definitions
    const timeIntelligenceDetails = Object.entries(BUSINESS_KNOWLEDGE.timeIntelligence)
        .map(([key, desc]) => `  - ${key.toUpperCase()}: ${desc}`)
        .join("\n");

    return `You are a Senior Analytics Engineer and DuckDB SQL Expert in the travel domain.
Your goal is to translate a user's natural language question into a high-quality, syntactically correct DuckDB SQL query.

---
### DATASET CLASSIFICATION & STRUCTURE
- Dataset Type: ${datasetType}
- Target Table: "data_table" (You MUST run all SELECT queries against the table name literal: "data_table")
- Columns Available:
${schemaDetails}

---
### BUSINESS KNOWLEDGE & CONCEPTS
Definitions for key business dimensions:
${businessConceptsDetails}

---
### METRIC DICTIONARY & REGISTERED FORMULAS
To calculate any metric below, you MUST use the exact formula expression specified here. Do not invent your own aggregation formulas:
${metricsDetails}

---
### TIME INTELLIGENCE REFERENCE
${timeIntelligenceDetails}
- Primary Time Column for filtering/bucketing: "${primaryTimeDimension || "None detected"}"

---
### DUCKDB SQL SYNTAX RULES
1. ALWAYS double-quote column names that contain spaces, special characters (like %), or uppercase letters. E.g. "Competitive Status", "Total Sales", "L2B%".
2. You can use standard DuckDB aggregations and functions: AVG, SUM, COUNT, MEDIAN, NULLIF, CAST, CASE WHEN, DATE_TRUNC, strftime, etc.
3. String comparisons must use single quotes. E.g. "Competitive Status" = 'Winning'.
4. Do not include semicolons at the end of the query.
5. Only SELECT statements are allowed. Modifying operations (DROP, DELETE, UPDATE, INSERT, ALTER, TRUNCATE) are strictly forbidden.

---
### OUTPUT FORMAT
You MUST return a JSON object matching this TypeScript interface. Do NOT output any conversational text, markdown, or commentary outside the JSON object:
\`\`\`json
{
  "explanation": "Brief explanation of how the query computes the desired numbers and mapping from user request to columns.",
  "sql": "SELECT ... FROM data_table ..."
}
\`\`\`

---
### USER QUESTION:
"${question}"
`;
}
