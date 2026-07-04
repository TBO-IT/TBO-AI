import { EnrichedSemanticLayer } from "./semanticLayer.js";
import { QuestionAnalysis, QuestionValidationError } from "./questionTypes.js";
import { analyzeQuestion } from "./questionAnalyzer.js";
import { validateQuestion } from "./questionValidator.js";

// ─── Token-Efficient Prompt Builder ──────────────────────────────────────────
//
// Design principles:
// 1. Only inject context relevant to the question (not the entire registry)
// 2. No full schema dumps — only columns, no internal DuckDB type details
// 3. Metric formulas are shown only for metrics relevant to the question
// 4. Business definitions only for dimensions relevant to the question
// 5. Time intelligence injected only when a time reference was detected

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatColumns(semanticLayer: EnrichedSemanticLayer): string {
    return semanticLayer.allColumns
        .map(col => `  "${col.column_name}"`)
        .join("\n");
}

function formatRelevantMetrics(
    semanticLayer: EnrichedSemanticLayer,
    parsedQuestion: QuestionAnalysis
): string {
    // If we have a parsed question with specific metrics, only show those
    // Otherwise show all metrics available for the dataset type
    const relevantKeys = parsedQuestion?.metrics.length
        ? parsedQuestion.metrics
        : semanticLayer.metricKeys;

    const relevantMetrics = semanticLayer.metrics.filter(m => {
        // Match by canonical key → metric name mapping
        const metricKeyFromName = m.name.toLowerCase().replace(/\s+/g, "_");
        return relevantKeys.some(k =>
            k === metricKeyFromName ||
            m.name.toLowerCase().includes(k.replace(/_/g, " ")) ||
            k.replace(/_/g, " ").includes(m.name.toLowerCase())
        );
    });

    // Fall back to all metrics if filtering produced nothing
    const toShow = relevantMetrics.length > 0 ? relevantMetrics : semanticLayer.metrics;

    return toShow
        .map(m => `  ${m.name}: ${m.formula}\n    → ${m.description}`)
        .join("\n");
}

function formatDimensions(
    semanticLayer: EnrichedSemanticLayer,
    parsedQuestion: QuestionAnalysis
): string {
    const relevantDims = parsedQuestion?.dimensions.length
        ? parsedQuestion.dimensions
        : semanticLayer.dimensions;

    const defs = semanticLayer.businessDefinitions.filter(d =>
        relevantDims.includes(d.name)
    );

    const toShow = defs.length > 0 ? defs : semanticLayer.businessDefinitions;

    if (toShow.length === 0) return "  (none detected)";

    return toShow
        .map(d => `  ${d.name}: ${d.definition}`)
        .join("\n");
}

function formatTimeContext(
    semanticLayer: EnrichedSemanticLayer,
    parsedQuestion: QuestionAnalysis
): string {
    const hasTimeRef = parsedQuestion.timeReferences.length > 0;
    const primaryCol = semanticLayer.primaryTimeDimension;
    const allCols    = semanticLayer.availableTimeColumns;

    if (!primaryCol && allCols.length === 0) {
        return "  No date columns detected in this dataset.";
    }

    let out = `  Primary time column: "${primaryCol || allCols[0]}"`;
    if (allCols.length > 1) {
        out += `\n  All time columns: ${allCols.map(c => `"${c}"`).join(", ")}`;
    }
    if (hasTimeRef) {
        out += `\n  User time reference: "${parsedQuestion.timeReferences.join(", ")}"`;
        out += `\n  Use DATE_TRUNC or strftime to filter on this column.`;
    }
    return out;
}

function formatFilters(parsedQuestion: QuestionAnalysis): string {
    if (!parsedQuestion?.filters.length) return "";
    return `\n---\n### FILTER VALUES DETECTED\nThe user is specifically asking about: ${parsedQuestion.filters.map(f => `"${f}"`).join(", ")}\nApply these as WHERE clause filters on the appropriate dimension column.\n`;
}

function formatIntent(parsedQuestion: QuestionAnalysis): string {
    if (!parsedQuestion) return "";
    const intentHints: Record<string, string> = {
        ROOT_CAUSE:  "The user wants to understand WHY something happened. Use subqueries or window functions to show the breakdown behind the trend.",
        TREND:       "The user wants to see change over time. Use DATE_TRUNC or strftime to bucket results by time period.",
        COMPARISON:  "The user wants to compare values. Use CASE WHEN or GROUP BY to show values side by side.",
        RANKING:     "The user wants a ranked list. Use ORDER BY with LIMIT.",
        CORRELATION: "The user is looking for relationships. Compute both metrics in the same query grouped by a common dimension.",
        ANOMALY:     "The user is looking for outliers. Use window functions like AVG() OVER or STDDEV_POP() to find deviations.",
        BREAKDOWN:   "The user wants segmented results. Use GROUP BY on the stated dimension.",
        SUMMARY:     "The user wants an overview. Return aggregated totals without excessive filtering."
    };
    const hint = intentHints[parsedQuestion.intent] ?? "";
    return hint ? `\n---\n### ANALYTICAL INTENT: ${parsedQuestion.intent}\n${hint}\n` : "";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds a compact, token-efficient prompt for Claude.
 * Automatically runs the Question Analyzer and Validator.
 * Throws QuestionValidationError if the question cannot be answered by the dataset.
 *
 * @param question - The raw user question string
 * @param semanticLayer - The enriched semantic layer for the dataset
 * @returns An object containing the generated prompt string and the parsed question
 */
export function buildPrompt(
    question: string,
    semanticLayer: EnrichedSemanticLayer,
    parsedQuestion?: QuestionAnalysis
): { prompt: string; parsedQuestion: QuestionAnalysis } {
    
    // 1. Use provided analysis or run the analyzer
    parsedQuestion = parsedQuestion || analyzeQuestion(question);

    // 2. Validate against semantic layer
    const validation = validateQuestion(parsedQuestion, semanticLayer);

    // 3. Throw if invalid
    if (!validation.valid) {
        throw new QuestionValidationError(validation);
    }

    const { datasetType } = semanticLayer;

    const prompt = `You are a Senior DuckDB SQL Expert for a travel analytics platform.
Translate the user's question into a single, syntactically correct DuckDB SQL query.

---
### DATASET
- Type: ${datasetType}
- Query target: always use the literal table name "data_table"
- Available columns:
${formatColumns(semanticLayer)}

---
### METRICS (use ONLY these exact formulas)
${formatRelevantMetrics(semanticLayer, parsedQuestion)}

---
### DIMENSIONS
${formatDimensions(semanticLayer, parsedQuestion)}

---
### TIME CONTEXT
${formatTimeContext(semanticLayer, parsedQuestion)}
${formatFilters(parsedQuestion)}${formatIntent(parsedQuestion)}
---
### SQL RULES
1. Double-quote ALL column names with spaces, % signs, or mixed case: e.g. "Competitive Status", "L2B%", "Hotel name"
2. Use single quotes for string literals: "Competitive Status" = 'Winning'
3. No semicolons at end of query
4. Only SELECT statements — no INSERT, UPDATE, DELETE, DROP, ALTER
5. Use NULLIF to protect against division by zero

---
### OUTPUT FORMAT
Return ONLY this JSON object, no markdown, no commentary:
{
  "explanation": "One sentence explaining how the query answers the question.",
  "sql": "SELECT ... FROM data_table ..."
}

---
### USER QUESTION
"${question}"
`;

    return { prompt, parsedQuestion };
}
