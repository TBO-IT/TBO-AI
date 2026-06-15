import { QuestionFilter } from "./questionTypes.js";
import { resolvePhysicalColumn, getDimension } from "./dimensionRegistry.js";

/**
 * Filter Builder
 *
 * Converts a list of structured QuestionFilters into a safe DuckDB WHERE clause.
 * All templates must use this — no template should build WHERE clauses manually.
 *
 * Input:  QuestionFilter[]  (canonical dimension + operator + value)
 * Output: "WHERE col = 'value' AND col2 ILIKE '%val%'"  (or "" if no filters)
 */

/**
 * Escapes a string value for safe inclusion in a SQL literal.
 * Prevents SQL injection via single-quote doubling.
 */
function escapeString(value: string): string {
    return value.replace(/'/g, "''");
}

/**
 * Builds a single SQL condition for one QuestionFilter.
 * Returns null if the physical column cannot be resolved from the schema.
 */
export function buildFilterCondition(
    filter: QuestionFilter,
    schemaColumns: string[]
): string | null {
    const physicalCol = resolvePhysicalColumn(filter.dimension, schemaColumns);

    if (!physicalCol) {
        console.warn(`[FilterBuilder] Cannot resolve physical column for dimension '${filter.dimension}'. Skipping filter.`);
        return null;
    }

    const dim = getDimension(filter.dimension);
    const operator = filter.operator;
    const safe = escapeString(filter.value);
    const col = `"${physicalCol}"`;

    if (operator === "ILIKE" || (dim && dim.filterType === "ilike")) {
        return `${col} ILIKE '%${safe}%'`;
    }

    if (operator === "IN") {
        // Value is a comma-separated list
        const values = filter.value.split(",").map(v => `'${escapeString(v.trim())}'`).join(", ");
        return `${col} IN (${values})`;
    }

    // = > < >= <=
    return `${col} ${operator} '${safe}'`;
}

/**
 * Builds a full WHERE clause string from an array of QuestionFilters.
 * Returns empty string if no filters or no conditions could be resolved.
 *
 * @param filters     The structured filters from QuestionAnalysis
 * @param schemaColumns  Physical column names from the actual dataset schema
 */
export function buildWhereClause(
    filters: QuestionFilter[],
    schemaColumns: string[]
): string {
    if (filters.length === 0) return "";

    const conditions: string[] = [];

    for (const filter of filters) {
        const condition = buildFilterCondition(filter, schemaColumns);
        if (condition) {
            conditions.push(condition);
            console.log(`[FilterBuilder] Applied filter: ${condition}`);
        }
    }

    if (conditions.length === 0) return "";

    return `WHERE ${conditions.join(" AND ")}`;
}
