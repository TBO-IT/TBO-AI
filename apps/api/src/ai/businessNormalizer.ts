import { QuestionAnalysis } from "./questionTypes.js";

/**
 * Normalizes absolute pricing gap values to signed physical values based on competitive status.
 * Rules:
 * 1. If status is Losing, convert range to a negative interval (e.g. BETWEEN 1 and 3 -> BETWEEN -3 AND -1)
 *    and invert comparison operators (e.g. > 5 -> < -5).
 * 2. If status is Winning, keep positive.
 * 3. If status is unspecified, convert dimension to `abs_` prefixed dimension to trigger ABS() wrap in SQL.
 */
export function normalizeBusinessSemantics(analysis: QuestionAnalysis): QuestionAnalysis {
    const statusFilter = analysis.filters.find(f => f.dimension === "competitive_status");
    const status = statusFilter ? String(statusFilter.value).toLowerCase() : null;

    const normalizedFilters = analysis.filters.map(filter => {
        if (filter.dimension === "avg_price_diff" || filter.dimension === "median_price_diff") {
            if (status === "losing") {
                if (filter.operator === "BETWEEN" && typeof filter.value === "string") {
                    const parts = filter.value.split(/\s+AND\s+/i);
                    if (parts.length === 2) {
                        const num1 = Number(parts[0]);
                        const num2 = Number(parts[1]);
                        if (!isNaN(num1) && !isNaN(num2)) {
                            const minAbs = Math.min(Math.abs(num1), Math.abs(num2));
                            const maxAbs = Math.max(Math.abs(num1), Math.abs(num2));
                            return {
                                ...filter,
                                value: `-${maxAbs} AND -${minAbs}`
                            };
                        }
                    }
                } else if (typeof filter.value === "number") {
                    let newOperator = filter.operator;
                    if (filter.operator === ">") newOperator = "<";
                    else if (filter.operator === ">=") newOperator = "<=";
                    else if (filter.operator === "<") newOperator = ">";
                    else if (filter.operator === "<=") newOperator = ">=";

                    return {
                        ...filter,
                        operator: newOperator,
                        value: -Math.abs(filter.value)
                    };
                }
            } else if (status === "winning") {
                if (filter.operator === "BETWEEN" && typeof filter.value === "string") {
                    const parts = filter.value.split(/\s+AND\s+/i);
                    if (parts.length === 2) {
                        const num1 = Number(parts[0]);
                        const num2 = Number(parts[1]);
                        if (!isNaN(num1) && !isNaN(num2)) {
                            const minAbs = Math.min(Math.abs(num1), Math.abs(num2));
                            const maxAbs = Math.max(Math.abs(num1), Math.abs(num2));
                            return {
                                ...filter,
                                value: `${minAbs} AND ${maxAbs}`
                            };
                        }
                    }
                } else if (typeof filter.value === "number") {
                    return {
                        ...filter,
                        value: Math.abs(filter.value)
                    };
                }
            } else {
                // Rule 3: Status unspecified, wrap in ABS() by prefixing "abs_"
                return {
                    ...filter,
                    dimension: `abs_${filter.dimension}`
                };
            }
        }
        return filter;
    });

    return {
        ...analysis,
        filters: normalizedFilters
    };
}
