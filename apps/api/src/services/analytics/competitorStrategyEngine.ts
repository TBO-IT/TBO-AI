import { QuestionAnalysis } from "../../ai/questionTypes.js";
import { EnrichedSemanticLayer } from "../../ai/semanticLayer.js";

export interface CompetitiveGap {
    dimension: string;
    ourMetric: number;
    competitorMetric: number;
    gap: number;
    recommendation: string;
}

export function generateCompetitorStrategySql(
    analysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer
): { sql: string; explanation: string; competitorName: string } | null {
    // 1. Identify the competitor from filters
    const competitorFilter = analysis.filters.find(f => f.dimension === "supplier" || f.dimension === "thirdparty");
    
    if (!competitorFilter) {
        return null;
    }

    const competitorName = String(competitorFilter.value);
    
    // We assume "Our" performance is represented by the overall average of everything else,
    // or specifically "TBO" if that's the baseline. Since we don't know the exact baseline name,
    // we will compare the competitor against the rest of the dataset.
    
    // Use the primary metric
    const metric = semanticLayer.metrics.find(m => m.name.toLowerCase().includes("win rate")) || semanticLayer.metrics[0];
    if (!metric) return null;

    // We will find gaps across key dimensions: APW, Destination, Chain
    // To keep it simple in a single SQL query, we will union them or just pick the top one.
    // Let's do a grouped query by APW Bucket to find where we lose to them.
    
    const apwCol = semanticLayer.allColumns.find(c => c.column_name.toLowerCase().includes("apw"))?.column_name || "apw_bucket_new";
    const supplierCol = competitorFilter.dimension === "thirdparty" 
        ? semanticLayer.allColumns.find(c => c.column_name.toLowerCase().includes("thirdparty"))?.column_name || "thirdparty"
        : semanticLayer.allColumns.find(c => c.column_name.toLowerCase().includes("supplier"))?.column_name || "suppliername";

    const sql = `
WITH by_apw AS (
    SELECT 
        "${apwCol}" AS dimension_value,
        CASE 
            WHEN "${supplierCol}" ILIKE '%${competitorName}%' THEN 'Competitor'
            ELSE 'Us'
        END AS entity_type,
        ${metric.formula} AS metric_value,
        COUNT(*) as volume
    FROM data_table
    WHERE "${apwCol}" IS NOT NULL
    GROUP BY 1, 2
)
SELECT 
    us.dimension_value AS "Segment",
    ROUND(us.metric_value, 4) AS "Our ${metric.name}",
    ROUND(comp.metric_value, 4) AS "Competitor ${metric.name}",
    ROUND(us.metric_value - comp.metric_value, 4) AS "Gap",
    us.volume AS "Volume"
FROM (SELECT * FROM by_apw WHERE entity_type = 'Us') us
JOIN (SELECT * FROM by_apw WHERE entity_type = 'Competitor') comp 
  ON us.dimension_value = comp.dimension_value
ORDER BY "Gap" ASC
LIMIT 10;
`;

    return {
        sql,
        explanation: `Comparing our performance vs ${competitorName} across segments to identify competitive gaps in ${metric.name}.`,
        competitorName
    };
}
