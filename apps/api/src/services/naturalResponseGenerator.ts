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
    // We strictly limit this to basic counting/listing to avoid dumping
    // raw tables for executive queries (which should route to Executive Priority)
    const simpleIntents = ["LIST", "COUNT"];
    if (!simpleIntents.includes(analysis.intent)) {
        // If it's a SUMMARY but only returning 1 row (like a single value lookup), that's fine
        if (analysis.intent === "SUMMARY" && results.length === 1 && Object.keys(results[0]).length <= 2) {
            return true;
        }
        return false;
    }

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
        return `We currently have **${value.toLocaleString('en-US')}** records matching your criteria.`;
    }

    return `Based on your query, we found **${results.length.toLocaleString('en-US')}** matching records.`;
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
            return `Based on the latest data, **${winRate}%** of the ${total.toLocaleString()} entities are currently winning against competitors.\n\n` +
                   `- **Winning:** ${winning.toLocaleString()}\n` +
                   `- **Losing:** ${losing.toLocaleString()}`;
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
    const labelField = findField(results, ["destination", "hotel", "supplier", "chain", "apw", "city", "contracting_manager", "contracting manager"]);

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
        return `| **${idx + 1}. ${label}** | ${value.toLocaleString()}${suffix} |`;
    });

    const dimension = analysis.dimensions[0] || "entities";
    const recordCountText = results.length > 5 ? `Out of **${results.length.toLocaleString()}** ${dimension}s analyzed, ` : "";
    
    return `${recordCountText}here are the top 5 you should focus on:\n\n` +
           `| ${dimension.charAt(0).toUpperCase() + dimension.slice(1)} | Value |\n` +
           `|---|---|\n` +
           `${items.join("\n")}\n\n` +
           `*Note: This ranking is based on ${valueField.replace(/_/g, " ")}.*`;
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
    if (results.length === 0) return "We couldn't find any data matching your criteria.";

    const firstRow = results[0];
    const keys = Object.keys(firstRow).slice(0, 4);

    const tableHeader = `| ${keys.map(k => k.replace(/_/g, " ").toUpperCase()).join(" | ")} |\n` +
                        `| ${keys.map(() => "---").join(" | ")} |`;
                        
    const tableRows = results.slice(0, 10).map(row => {
        return `| ${keys.map(k => {
            const val = row[k];
            if (typeof val === "number") return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
            return val;
        }).join(" | ")} |`;
    });

    const output = `We analyzed **${results.length.toLocaleString()}** records. Here is a summary of the top results:\n\n` +
                   `${tableHeader}\n` +
                   `${tableRows.join("\n")}`;

    if (results.length > 10) {
        return output + `\n\n*Displaying the top 10 rows out of ${results.length.toLocaleString()} total.*`;
    }

    return output;
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