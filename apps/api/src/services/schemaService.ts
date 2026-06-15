import { runQuery } from "./queryService.js";
import { DatasetColumn } from "../ai/llmtypes.js";

export async function getDatasetSchema(csvPath: string): Promise<DatasetColumn[]> {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `DESCRIBE SELECT * FROM read_csv_auto('${normalizedPath}', ignore_errors=true)`;
    
    try {
        const rows = await runQuery<{ column_name: string; column_type: string }>(sql);
        return rows.map(r => ({
            column_name: r.column_name,
            column_type: r.column_type
        }));
    } catch (error) {
        console.error("Error getting schema via DuckDB:", error);
        throw new Error(`Failed to discover schema for dataset: ${error instanceof Error ? error.message : String(error)}`);
    }
}
