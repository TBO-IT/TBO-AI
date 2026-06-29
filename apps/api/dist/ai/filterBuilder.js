import { resolvePhysicalColumn, getDimension } from "./dimensionRegistry.js";
/**
 * Filter Builder
 *
 * Converts a list of structured QuestionFilters into a safe DuckDB WHERE clause.
 * All templates must use this — no template should build WHERE clauses manually.
 *
 * Input:  QuestionFilter[]  (canonical dimension + operator + value)
 * Output: "WHERE cond1 AND cond2 AND cond3"  (or "" if no filters)
 *
 * Architecture rule: buildWhereClause() contains NO dimension-specific logic.
 * All per-dimension SQL generation lives exclusively in buildFilterCondition().
 */
// ─── Date column used for all time-based filters ──────────────────────────────
// scraped_date is a VARCHAR in MM/DD/YYYY format — must use STRPTIME.
const DATE_EXPR = `STRPTIME("scraped_date", '%m/%d/%Y')`;
/**
 * Escapes a string value for safe inclusion in a SQL literal.
 * Prevents SQL injection via single-quote doubling.
 */
function escapeString(value) {
    return value.replace(/'/g, "''");
}
/**
 * Builds a single SQL condition for one QuestionFilter.
 * Returns null if the physical column cannot be resolved from the schema.
 *
 * Handles ALL dimension types:
 *  - month/year/quarter → EXTRACT(... FROM STRPTIME(...))
 *  - ILIKE/string dims  → col ILIKE '%value%'
 *  - IN operator        → col IN ('a', 'b')
 *  - equality/range     → col = 'value' / col >= value
 */
export function buildFilterCondition(filter, schemaColumns) {
    // ── Time dimension filters (no physical column needed) ─────────────────────
    if (filter.dimension === "month") {
        return `EXTRACT(MONTH FROM ${DATE_EXPR}) = ${filter.value}`;
    }
    if (filter.dimension === "year") {
        return `EXTRACT(YEAR FROM ${DATE_EXPR}) = ${filter.value}`;
    }
    if (filter.dimension === "quarter") {
        return `EXTRACT(QUARTER FROM ${DATE_EXPR}) = ${filter.value}`;
    }
    // ── All other filters — resolve physical column from schema ────────────────
    const physicalCol = resolvePhysicalColumn(filter.dimension, schemaColumns);
    if (!physicalCol) {
        console.warn(`[FilterBuilder] Cannot resolve physical column for dimension '${filter.dimension}'. Skipping filter.`);
        return null;
    }
    const dim = getDimension(filter.dimension);
    const operator = filter.operator;
    const col = `"${physicalCol}"`;
    // Numeric values must NOT be quoted in SQL
    if (typeof filter.value === "number") {
        return `${col} ${operator} ${filter.value}`;
    }
    const safe = escapeString(filter.value);
    if (operator === "ILIKE" || (dim && dim.filterType === "ilike")) {
        return `${col} ILIKE '%${safe}%'`;
    }
    if (operator === "IN") {
        // Value is a comma-separated list
        const values = filter.value
            .split(",")
            .map(v => `'${escapeString(v.trim())}'`)
            .join(", ");
        return `${col} IN (${values})`;
    }
    if (operator === "=") {
        if (filter.dimension === "thirdparty" || filter.dimension === "supplier") {
            return `LOWER(TRIM(${col})) = LOWER(TRIM('${safe}'))`;
        }
    }
    // = > < >= <=
    return `${col} ${operator} '${safe}'`;
}
/**
 * Builds a full WHERE clause string from an array of QuestionFilters.
 * Returns empty string if no filters or no conditions could be resolved.
 *
 * This function contains NO dimension-specific logic — it only:
 *  1. Iterates through filters
 *  2. Delegates to buildFilterCondition()
 *  3. Collects non-null conditions
 *  4. Returns "WHERE cond1 AND cond2 AND ..."
 *
 * @param filters        The structured filters from QuestionAnalysis
 * @param schemaColumns  Physical column names from the actual dataset schema
 */
export function buildWhereClause(filters, schemaColumns) {
    if (filters.length === 0)
        return "";
    const conditions = [];
    for (const filter of filters) {
        const condition = buildFilterCondition(filter, schemaColumns);
        if (condition) {
            conditions.push(condition);
            console.log(`[FilterBuilder] Applied filter: ${condition.trim()}`);
        }
    }
    if (conditions.length === 0)
        return "";
    return `WHERE ${conditions.join(" AND ")}`;
}
