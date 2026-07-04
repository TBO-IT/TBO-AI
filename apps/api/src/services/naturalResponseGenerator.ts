import { QuestionAnalysis, QuestionFilter } from "../ai/questionTypes.js";

// ─── Natural Response Generator ────────────────────────────────────────────────
// Generates conversational responses WITHOUT calling Claude
// Handles simple queries: counts, lookups, rankings, status queries
// This saves 1-3 seconds per query by skipping Claude
// ────────────────────────────────────────────────────────────────────────────────

export type SimpleQueryType = "count" | "status" | "ranking" | "lookup" | "comparison" | "complex";

interface NaturalResponseResult {
    response: string;
    queryType: SimpleQueryType;
    requiresClaude: boolean;
    dataSummary?: {
        total?: number;
        topItems?: Array<{ name: string; value: number }>;
        statusBreakdown?: Record<string, number>;
    };
}

/**
 * Analyzes the question and results to determine if we can generate a natural response
 */
export function canUseNaturalResponse(
    analysis: QuestionAnalysis,
    results: Record<string, unknown>[]
): boolean {
    // Must have results
    if (!results || results.length === 0) return false;

    // Check if it's a simple query type
    const simpleIntents = ["LIST", "SUMMARY", "RANKING", "BREAKDOWN"];
    if (!simpleIntents.includes(analysis.intent)) return false;

    // If results are too many rows, might be complex
    if (results.length > 100) return false;

    return true;
}

/**
 * Detects what kind of simple query this is
 */
function detectQueryType(
    analysis: QuestionAnalysis,
    results: Record<string, unknown>[]
): SimpleQueryType {
    const q = analysis.originalQuestion.toLowerCase();
    const intent = analysis.intent;

    // Count queries
    if (q.includes("how many") || q.includes("count") || q.includes("total number")) {
        return "count";
    }

    // Status queries (winning/losing)
    if (q.includes("winning") || q.includes("losing") || q.includes("status")) {
        return "status";
    }

    // Ranking queries
    if (intent === "RANKING" || q.includes("top ") || q.includes("bottom ") || q.includes("best ") || q.includes("worst ")) {
        return "ranking";
    }

    // Lookup queries (specific hotel, destination, etc.)
    if (analysis.focus || analysis.filters.length > 0) {
        return "lookup";
    }

    // Comparison queries
    if (intent === "COMPARISON" || q.includes(" vs ") || q.includes("versus") || q.includes("compare")) {
        return "comparison";
    }

    // Default to complex if unsure
    return "complex";
}

/**
 * Generate natural response for COUNT queries
 */
function generateCountResponse(
    results: Record<string, unknown>[],
    analysis: QuestionAnalysis
): string {
    const firstRow = results[0];
    const value = firstRow ? Object.values(firstRow)[0] : 0;

    if (typeof value === "number") {
        const filters = describeFilters(analysis.filters);
        return `There ${value === 1 ? "is" : "are"} ${value.toLocaleString()} ${filters} in your dataset.`;
    }

    return `Found ${results.length} records matching your query.`;
}

/**
 * Generate natural response for STATUS queries (winning/losing)
 */
function generateStatusResponse(
    results: Record<string, unknown>[],
    analysis: QuestionAnalysis
): string {
    // Try to find winning/losing counts
    const statusField = findField(results, ["competitive status", "competitive_status", "status", "winning", "losing"]);
    const countField = findField(results, ["count", "cnt", "total", "num", "hotel_count"]);

    if (statusField && countField) {
        const breakdown: Record<string, number> = {};
        for (const row of results) {
            const status = String(row[statusField] || "").toLowerCase();
            const count = Number(row[countField]) || 0;
            if (status) breakdown[status] = (breakdown[status] || 0) + count;
        }

        const winning = breakdown["winning"] || breakdown["win"] || 0;
        const losing = breakdown["losing"] || breakdown["lose"] || 0;
        const total = winning + losing;

        if (total > 0) {
            const winRate = ((winning / total) * 100).toFixed(1);
            return `Of ${total.toLocaleString()} hotels, ${winning.toLocaleString()} are winning (${winRate}%) and ${losing.toLocaleString()} are losing.`;
        }
    }

    // Fallback: list the results
    return summarizeResults(results);
}

/**
 * Generate natural response for RANKING queries
 */
function generateRankingResponse(
    results: Record<string, unknown>[],
    analysis: QuestionAnalysis
): string {
    const valueField = findField(results, ["count", "win_rate", "wins", "losing", "price_diff_perc", "avg_price_diff", "total"]);
    const labelField = findField(results, ["destination", "hotel", "supplier", "chain", "apw", "city"]);

    if (!valueField || !labelField) {
        return summarizeResults(results);
    }

    // Sort by value (descending for counts/rates, ascending for price diff if negative is better)
    const sorted = [...results].sort((a, b) => {
        const valA = Number(a[valueField]) || 0;
        const valB = Number(b[valueField]) || 0;
        return valB - valA;
    });

    const top5 = sorted.slice(0, 5);
    const items = top5.map((row, idx) => {
        const label = row[labelField];
        const value = Number(row[valueField]);
        const suffix = valueField.includes("rate") || valueField.includes("perc") ? "%" : "";
        return `${idx + 1}. ${label}: ${value.toLocaleString()}${suffix}`;
    });

    const dimension = analysis.dimensions[0] || "item";
    return `Top 5 by ${dimension}:\n${items.join("\n")}`;
}

/**
 * Generate natural response for LOOKUP queries
 */
function generateLookupResponse(
    results: Record<string, unknown>[],
    analysis: QuestionAnalysis
): string {
    if (results.length === 0) {
        return "No data found matching your query.";
    }

    if (results.length === 1) {
        const row = results[0];
        const fields = Object.keys(row);
        const bits: string[] = [];

        for (const field of fields) {
            if (field === "tbo_price" || field === "thirdparty_price") {
                const val = Number(row[field]);
                if (val) bits.push(`${field}: $${val.toLocaleString()}`);
            } else if (field.includes("price") || field.includes("diff") || field.includes("rate")) {
                const val = Number(row[field]);
                if (val !== undefined && !isNaN(val)) {
                    bits.push(`${field}: ${val.toFixed(2)}`);
                }
            } else if (typeof row[field] === "string") {
                bits.push(`${field}: ${row[field]}`);
            }
        }

        return bits.join(" | ");
    }

    // Multiple results - summarize
    return summarizeResults(results);
}

/**
 * Generate natural response for COMPARISON queries
 */
function generateComparisonResponse(
    results: Record<string, unknown>[],
    analysis: QuestionAnalysis
): string {
    const q = analysis.originalQuestion.toLowerCase();

    // Look for comparison between destinations, hotels, competitors
    const entityField = findField(results, ["destination", "hotel", "supplier", "thirdparty", "chain"]);
    const valueField = findField(results, ["win_rate", "wins", "count", "price_diff_perc", "avg_price_diff"]);

    if (!entityField || !valueField) {
        return summarizeResults(results);
    }

    const sorted = [...results].sort((a, b) => {
        const valA = Number(a[valueField]) || 0;
        const valB = Number(b[valueField]) || 0;
        return valB - valA;
    });

    if (sorted.length >= 2) {
        const first = sorted[0];
        const second = sorted[1];
        const val1 = Number(first[valueField]) || 0;
        const val2 = Number(second[valueField]) || 0;
        const diff = Math.abs(val1 - val2).toFixed(1);
        const suffix = valueField.includes("rate") || valueField.includes("perc") ? "%" : "";

        return `${first[entityField]} (${val1}${suffix}) vs ${second[entityField]} (${val2}${suffix}) — ${diff}${suffix} difference`;
    }

    return summarizeResults(results);
}

/**
 * Summarize results as a bullet list (last resort)
 */
function summarizeResults(results: Record<string, unknown>[]): string {
    if (results.length === 0) return "No data found.";

    const firstRow = results[0];
    const keys = Object.keys(firstRow).slice(0, 3);

    const bits = results.slice(0, 5).map(row => {
        return keys.map(k => `${k}: ${row[k]}`).join(", ");
    });

    if (results.length > 5) {
        return bits.join("\n") + `\n... and ${results.length - 5} more`;
    }

    return bits.join("\n");
}

/**
 * Find a field in results matching possible names
 */
function findField(results: Record<string, unknown>[], possibleNames: string[]): string | null {
    if (!results.length) return null;
    const keys = Object.keys(results[0]).map(k => k.toLowerCase());

    for (const name of possibleNames) {
        const found = keys.find(k => k.includes(name.toLowerCase()));
        if (found) {
            // Return the actual case-sensitive key
            return Object.keys(results[0]).find(k => k.toLowerCase() === found) || null;
        }
    }
    return null;
}

/**
 * Describe filters in human-readable form
 */
function describeFilters(filters: QuestionFilter[]): string {
    if (!filters.length) return "records";

    const parts = filters.map(f => {
        if (f.operator === "=") {
            return `${f.dimension}: ${f.value}`;
        }
        return `${f.dimension} ${f.operator} ${f.value}`;
    });

    return parts.join(", ");
}

/**
 * Main function: generate natural response for simple queries
 */
export function generateNaturalResponse(
    analysis: QuestionAnalysis,
    results: Record<string, unknown>[]
): NaturalResponseResult {
    const queryType = detectQueryType(analysis, results);

    if (queryType === "complex") {
        return {
            response: "",
            queryType: "complex",
            requiresClaude: true
        };
    }

    let response = "";
    let dataSummary: NaturalResponseResult["dataSummary"];

    switch (queryType) {
        case "count":
            response = generateCountResponse(results, analysis);
            const firstRow = results[0];
            const countVal = firstRow ? Object.values(firstRow)[0] : 0;
            dataSummary = { total: Number(countVal) || results.length };
            break;

        case "status":
            response = generateStatusResponse(results, analysis);
            // Build status breakdown
            const statusField = findField(results, ["competitive status", "status"]);
            const countField = findField(results, ["count", "total"]);
            if (statusField && countField) {
                const breakdown: Record<string, number> = {};
                for (const row of results) {
                    const status = String(row[statusField] || "").toLowerCase();
                    const count = Number(row[countField]) || 0;
                    if (status) breakdown[status] = (breakdown[status] || 0) + count;
                }
                dataSummary = { statusBreakdown: breakdown };
            }
            break;

        case "ranking":
            response = generateRankingResponse(results, analysis);
            const valueField = findField(results, ["count", "win_rate", "wins"]);
            const labelField = findField(results, ["destination", "hotel", "supplier"]);
            if (valueField && labelField) {
                const topItems = results.slice(0, 5).map(row => ({
                    name: String(row[labelField] || "Unknown"),
                    value: Number(row[valueField]) || 0
                }));
                dataSummary = { topItems };
            }
            break;

        case "lookup":
            response = generateLookupResponse(results, analysis);
            break;

        case "comparison":
            response = generateComparisonResponse(results, analysis);
            break;

        default:
            response = summarizeResults(results);
    }

    return {
        response,
        queryType,
        requiresClaude: false,
        dataSummary
    };
}

/**
 * Generate a very natural opening response based on the question
 */
export function generateNaturalOpening(question: string, analysis: QuestionAnalysis): string {
    const q = question.toLowerCase();

    if (q.startsWith("what") || q.startsWith("how")) {
        // Direct question - start with the answer naturally
        return "";
    }

    if (q.includes("show me") || q.includes("give me") || q.includes("list")) {
        // Request - acknowledge and deliver
        return "";
    }

    return "";
}