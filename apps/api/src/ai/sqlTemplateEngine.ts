import { QuestionAnalysis } from "./questionTypes.js";
import { EnrichedSemanticLayer } from "./semanticLayer.js";

function getColumnName(key: string, mappings: Record<string, string>, schemaCols: {column_name: string}[]): string {
    // Find the exact column name from the schema that maps to this key
    const col = schemaCols.find(c => c.column_name === key || mappings[c.column_name] === key);
    return col ? col.column_name : key;
}

/**
 * Attempts to generate SQL deterministically for simple questions.
 * Returns the SQL string if successful, or null if it's too complex and needs Claude.
 */
export function generateTemplatedSql(
    analysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer
): string | null {
    const { intent, metrics, dimensions, timeReferences } = analysis;

    // We only template very simple questions right now
    if (metrics.length !== 1) return null;
    if (timeReferences.length > 0) return null; // Date math is tricky, leave to Claude for now
    if (analysis.filters.length > 0) return null; // Filters require precise WHERE clauses, leave to Claude

    const metric = semanticLayer.metrics.find(m => 
        m.name.toLowerCase().replace(/\s+/g, "_") === metrics[0] ||
        m.name.toLowerCase().includes(metrics[0].replace(/_/g, " "))
    );

    if (!metric) return null;

    const metricFormula = metric.formula;
    
    // SUMMARY intent: "Total searches", "Show bookings"
    if (intent === "SUMMARY" && dimensions.length === 0) {
        return `SELECT ${metricFormula} AS "${metric.name}" FROM data_table`;
    }

    // RANKING intent: "Top cities by bookings", "Top suppliers by sales"
    if (intent === "RANKING" && dimensions.length === 1) {
        const dimCol = getColumnName(dimensions[0], semanticLayer.columnMappings, semanticLayer.allColumns);
        return `SELECT "${dimCol}", ${metricFormula} AS "${metric.name}" FROM data_table GROUP BY "${dimCol}" ORDER BY "${metric.name}" DESC NULLS LAST LIMIT 10`;
    }

    // BREAKDOWN intent: "Bookings by country", "Country breakdown"
    if (intent === "BREAKDOWN" && dimensions.length === 1) {
        const dimCol = getColumnName(dimensions[0], semanticLayer.columnMappings, semanticLayer.allColumns);
        return `SELECT "${dimCol}", ${metricFormula} AS "${metric.name}" FROM data_table GROUP BY "${dimCol}" ORDER BY "${metric.name}" DESC NULLS LAST`;
    }

    return null;
}
