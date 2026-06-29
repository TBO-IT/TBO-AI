import { executeSql } from "./queryExecutionService.js";
export async function getDatasetSchema(csvPath) {
    const sql = `
        DESCRIBE
        SELECT *
        FROM read_csv_auto(
            '${csvPath.replace(/\\/g, "/")}',
            ignore_errors=true
        )
    `;
    return executeSql(sql);
}
export async function getSampleRows(csvPath, limit = 5) {
    const sql = `
        SELECT *
        FROM read_csv_auto(
            '${csvPath.replace(/\\/g, "/")}',
            ignore_errors=true
        )
        LIMIT ${limit}
    `;
    return executeSql(sql);
}
export async function getColumnStatistics(csvPath) {
    const sql = `
        SELECT
            COUNT(*) as rowCount
        FROM read_csv_auto(
            '${csvPath.replace(/\\/g, "/")}',
            ignore_errors=true
        )
    `;
    const result = await executeSql(sql);
    return result[0];
}
import { classifySchema } from "../ai/schemaClassifier.js";
import { BUSINESS_KNOWLEDGE } from "../ai/businessKnowledge.js";
import { METRIC_REGISTRY } from "../ai/metricRegistry.js";
export async function buildDatasetContext(csvPath) {
    const schema = await getDatasetSchema(csvPath);
    const sampleRows = await getSampleRows(csvPath);
    const statistics = await getColumnStatistics(csvPath);
    const datasetType = classifySchema(schema.map((column) => column.column_name));
    return {
        datasetType,
        schema,
        sampleRows,
        statistics,
        businessKnowledge: BUSINESS_KNOWLEDGE,
        metrics: METRIC_REGISTRY
    };
}
