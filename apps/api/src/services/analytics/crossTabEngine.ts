import { QuestionAnalysis } from "../../ai/questionTypes.js";
import { EnrichedSemanticLayer } from "../../ai/semanticLayer.js";
import { resolvePhysicalColumn } from "../../ai/dimensionRegistry.js";
import { buildWhereClause } from "../../ai/filterBuilder.js";

/**
 * CrossTab Engine generates 2D matrix queries.
 * Example: destination vs chain by win_rate
 */
export function generateCrossTabSql(
    parsedQuestion: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer,
    dimA: string,
    dimB: string,
    metricKey?: string
): { sql: string; explanation: string } | null {
    const schemaColumns = semanticLayer.allColumns.map(c => c.column_name);

    const physicalDimA = resolvePhysicalColumn(dimA, schemaColumns);
    const physicalDimB = resolvePhysicalColumn(dimB, schemaColumns);

    if (!physicalDimA || !physicalDimB) {
        return null;
    }

    // Resolve metric
    let targetMetricKey = metricKey;
    if (!targetMetricKey) {
        targetMetricKey = parsedQuestion.metrics.length > 0
            ? parsedQuestion.metrics[0]
            : semanticLayer.metricKeys[0];
    }

    const metric = semanticLayer.metrics.find(m =>
        m.name.toLowerCase().replace(/\s+/g, "_") === targetMetricKey ||
        m.name.toLowerCase().includes((targetMetricKey || "").replace(/_/g, " "))
    );

    if (!metric) return null;

    const where = buildWhereClause(parsedQuestion.filters, schemaColumns);
    const w = where ? `\nWHERE ${where}\n  AND "${physicalDimA}" IS NOT NULL AND "${physicalDimB}" IS NOT NULL` 
                   : `\nWHERE "${physicalDimA}" IS NOT NULL AND "${physicalDimB}" IS NOT NULL`;

    // To prevent giant matrices, limit the rows and cols to top 15 by volume
    const sql = [
        `WITH top_a AS (`,
        `    SELECT "${physicalDimA}" AS dim_a`,
        `    FROM data_table`,
        `    ${w}`,
        `    GROUP BY "${physicalDimA}"`,
        `    ORDER BY COUNT(*) DESC`,
        `    LIMIT 15`,
        `),`,
        `top_b AS (`,
        `    SELECT "${physicalDimB}" AS dim_b`,
        `    FROM data_table`,
        `    ${w}`,
        `    GROUP BY "${physicalDimB}"`,
        `    ORDER BY COUNT(*) DESC`,
        `    LIMIT 15`,
        `)`,
        `SELECT`,
        `    a.dim_a AS "${dimA}",`,
        `    b.dim_b AS "${dimB}",`,
        `    COUNT(d.*) AS "Volume",`,
        `    ROUND(${metric.formula}, 4) AS "${metric.name}"`,
        `FROM top_a a`,
        `CROSS JOIN top_b b`,
        `LEFT JOIN data_table d `,
        `  ON a.dim_a = d."${physicalDimA}" `,
        ` AND b.dim_b = d."${physicalDimB}"`,
        ` ${where ? ` AND ${where}` : ''}`,
        `GROUP BY a.dim_a, b.dim_b`,
        `ORDER BY a.dim_a, b.dim_b`
    ].join("\n");

    return {
        sql,
        explanation: `Cross-tab analysis of ${dimA} by ${dimB} for ${metric.name}.`
    };
}
