import { TemplateDefinition, ResolvedSlots, SqlQuery, Tier0StructuredResponse } from "../types.js";

function getMetricExpression(metric: string): string {
    switch(metric) {
        case "win_rate":
            return "ROUND(SUM(CASE WHEN tbo_price < thirdparty_price THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 1)";
        case "avg_price_diff":
            return "ROUND(AVG(price_diff_perc), 1)";
        case "median_price_diff":
            return "ROUND(MEDIAN(price_diff_perc), 1)";
        case "volume":
            return "COUNT(*)";
        case "share_of_total":
            // Not directly implementable in a single non-windowed query without a subquery, 
            // but we can just return volume for the slice and handle % in UI if needed.
            // For now, map to volume.
            return "COUNT(*)";
        default:
            return "ROUND(SUM(CASE WHEN tbo_price < thirdparty_price THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 1)";
    }
}

export const universalTemplate: TemplateDefinition = {
    id: "T00_UNIVERSAL",
    patterns: [], // Matched explicitly by Component Extractor
    slots: [], // Handled dynamically in router

    generateSql: (resolvedSlots: ResolvedSlots): SqlQuery => {
        const { metric, filters = [], groupBy = [], threshold } = resolvedSlots;
        
        const metricExpr = getMetricExpression(metric);
        
        let selectClause = "";
        let groupByClause = "";
        
        if (groupBy && groupBy.length > 0) {
            const safeGroups = groupBy.map((g: string) => `"${g.replace(/"/g, '""')}"`).join(", ");
            selectClause = `SELECT ${safeGroups}, ${metricExpr} AS val, COUNT(*) as vol FROM data_table`;
            groupByClause = `GROUP BY ${safeGroups}`;
        } else {
            selectClause = `SELECT ${metricExpr} AS val, COUNT(*) as vol FROM data_table`;
        }
        
        let whereClauses: string[] = [];
        const params: any[] = [];
        
        for (const f of filters) {
            whereClauses.push(`"${f.dimension}" ${f.operator} ?`);
            params.push(f.value);
        }
        
        // threshold applies to price gap usually, but can apply to win rate using HAVING
        // Wait, T39 says "hotels breaching a price threshold"
        // If there's a threshold and NO groupBy, we probably want to list hotels?
        // Actually, if threshold exists, add it to HAVING
        let havingClause = "";
        if (threshold) {
            havingClause = `HAVING ${metricExpr} > ${parseFloat(threshold)}`;
        }
        
        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
        const limitClause = "LIMIT 100"; // Safeguard
        const orderByClause = groupBy && groupBy.length > 0 ? "ORDER BY val DESC" : "";
        
        const query = [selectClause, whereClause, groupByClause, havingClause, orderByClause, limitClause]
            .filter(Boolean)
            .join(" ");

        return { query, params };
    },

    formatAnswer: (rows: any[], resolvedSlots: ResolvedSlots): Tier0StructuredResponse | string => {
        const { metric, groupBy = [], filters = [] } = resolvedSlots;
        
        if (rows.length === 0) {
            return "No matching data for that combination. Try adjusting your filters.";
        }

        const filterContext = filters.map((f: any) => `${f.dimension} ${f.operator} ${f.value}`).join(", ");
        const ctxStr = filterContext ? ` for ${filterContext}` : "";

        if (groupBy.length === 0) {
            const val = rows[0].val;
            return {
                answer: `The ${metric.replace(/_/g, " ")}${ctxStr} is **${val}**.`,
                highlight: { metric, value: val }
            };
        }

        if (groupBy.length === 1) {
            // Grouped Bar Chart
            const dim = groupBy[0];
            const isPercent = metric === "win_rate" || metric === "avg_price_diff";
            
            return {
                answer: `Here is the ${metric.replace(/_/g, " ")} broken down by ${dim}${ctxStr}:`,
                chart: {
                    type: "bar",
                    data: rows.map(r => ({ name: String(r[dim]), value: Number(r.val) })),
                    config: {
                        valueLabel: metric.replace(/_/g, " "),
                        valueFormat: isPercent ? "percent" : "number"
                    }
                },
                table: {
                    columns: [dim, metric, "Volume"],
                    rows: rows.map(r => [r[dim], r.val, r.vol])
                }
            };
        }

        if (groupBy.length === 2) {
            // Pivot / Cross-Tab Table (T37)
            const [dimA, dimB] = groupBy;
            return {
                answer: `Here is a matrix of ${metric.replace(/_/g, " ")} by ${dimA} and ${dimB}${ctxStr}:`,
                table: {
                    columns: [dimA, dimB, metric, "Volume"],
                    rows: rows.map(r => [r[dimA], r[dimB], r.val, r.vol])
                }
            };
        }

        return "Too many dimensions to render cleanly.";
    }
};
