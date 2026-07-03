// ─── Query Validation Service ─────────────────────────────────────────────────
//
// Pre-execution validation that catches common issues before SQL hits the database.
// Returns user-friendly error messages instead of raw SQL/DuckDB errors.
// ───────────────────────────────────────────────────────────────────────────────

import { QuestionAnalysis } from "../ai/questionTypes.js";
import { EnrichedSemanticLayer } from "../ai/semanticLayer.js";

export interface QueryValidationResult {
    valid: boolean;
    errors: string[];
    suggestions: string[];
}

/**
 * Validates a parsed question against the semantic layer before SQL generation.
 * Catches issues that would produce empty results or meaningless queries.
 */
export function validateQueryPreExecution(
    analysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer
): QueryValidationResult {
    const errors: string[] = [];
    const suggestions: string[] = [];

    // 1. Validate metrics exist in the semantic layer
    for (const metric of analysis.metrics) {
        const found = semanticLayer.metrics.some(
            m => m.name.toLowerCase() === metric.toLowerCase() ||
                 m.name.toLowerCase().replace(/\s+/g, "_") === metric.toLowerCase() ||
                 m.name.toLowerCase() === metric.toLowerCase().replace(/_/g, " ")
        );
        if (!found) {
            errors.push(`Unknown metric: "${metric}". This dataset does not contain a metric called "${metric}".`);
            const available = semanticLayer.metrics.map(m => m.name).join(", ");
            suggestions.push(`Available metrics: ${available}`);
        }
    }

    // 2. Validate dimensions exist
    for (const dim of analysis.dimensions) {
        const found = semanticLayer.dimensions.some(
            d => d.toLowerCase() === dim.toLowerCase()
        );
        if (!found) {
            errors.push(`Unknown dimension: "${dim}". This dataset does not have a "${dim}" dimension.`);
            const available = semanticLayer.dimensions.join(", ");
            suggestions.push(`Available dimensions: ${available}`);
        }
    }

    // 3. Validate time filters are reasonable
    const timeFilters = analysis.filters.filter(f => 
        ["month", "quarter", "year"].includes(f.dimension)
    );

    for (const tf of timeFilters) {
        if (tf.dimension === "month") {
            const monthNum = Number(tf.value);
            if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
                errors.push(`Invalid month filter: "${tf.value}". Month must be between 1 and 12.`);
            }
        }
        if (tf.dimension === "quarter") {
            const qNum = Number(tf.value);
            if (isNaN(qNum) || qNum < 1 || qNum > 4) {
                errors.push(`Invalid quarter filter: "${tf.value}". Quarter must be between 1 and 4.`);
            }
        }
        if (tf.dimension === "year") {
            const yearNum = Number(tf.value);
            if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
                errors.push(`Invalid year filter: "${tf.value}". Year must be between 2000 and 2100.`);
            }
        }
    }

    // 4. Validate comparison has exactly two comparable entities
    if (analysis.intent === "COMPARISON") {
        const comparisonFilters = analysis.filters.filter(f => 
            !["month", "quarter", "year", "time", "_entity"].includes(f.dimension)
        );
        if (comparisonFilters.length < 2) {
            errors.push(`Comparison requires at least two entities to compare. Found ${comparisonFilters.length}.`);
            suggestions.push(`Try: "compare [Entity A] vs [Entity B]"`);
        }
    }

    // 5. Validate root cause has at least one time reference
    if (analysis.intent === "ROOT_CAUSE") {
        if (timeFilters.length < 2) {
            // Root cause typically needs "from X to Y" — two time points
            suggestions.push(
                `Root cause analysis works best with two time periods. ` +
                `Try: "why did [metric] change from [period A] to [period B]"`
            );
        }
    }

    // 6. Validate no conflicting filters (same dimension with = operator pointing to different values)
    const equalFilters = analysis.filters.filter(f => f.operator === "=");
    const filtersByDim = new Map<string, Set<string | number>>();
    for (const f of equalFilters) {
        if (!filtersByDim.has(f.dimension)) {
            filtersByDim.set(f.dimension, new Set());
        }
        filtersByDim.get(f.dimension)!.add(f.value);
    }
    
    for (const [dim, values] of filtersByDim.entries()) {
        // Multiple = filters on same non-time dimension is potentially a comparison, not conflicting
        if (values.size > 2 && !["month", "quarter", "year"].includes(dim)) {
            suggestions.push(
                `Multiple values detected for "${dim}": ${[...values].join(", ")}. ` +
                `If this is a comparison, try "compare X vs Y".`
            );
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        suggestions
    };
}

/**
 * Validates query results after execution.
 * Checks for empty results and provides user-friendly explanations.
 */
export function validateQueryResults(
    results: Record<string, unknown>[],
    routeType: string,
    question: string
): QueryValidationResult {
    const errors: string[] = [];
    const suggestions: string[] = [];

    if (!results || results.length === 0) {
        errors.push("No data found matching your query.");
        
        if (routeType === "ROOT_CAUSE") {
            suggestions.push(
                "Root cause analysis requires data in both time periods. " +
                "Check that your date range contains data."
            );
        } else if (routeType === "COMPARISON") {
            suggestions.push(
                "The entities you're comparing may not exist in the dataset. " +
                "Try checking the exact spelling."
            );
        } else {
            suggestions.push("Try broadening your query or checking filter values.");
        }
    }

    // Check for all-null results
    if (results.length > 0) {
        const allNull = results.every(row => 
            Object.values(row).every(v => v === null || v === undefined)
        );
        if (allNull) {
            errors.push("Query returned results but all values are null.");
            suggestions.push("The metrics or dimensions in your query may not have data for the specified filters.");
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        suggestions
    };
}
