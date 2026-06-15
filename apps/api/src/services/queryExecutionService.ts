import { runQuery } from "./queryService.js";

export async function executeQuery(sql: string, csvPath: string): Promise<any[]> {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    // Swap the data_table placeholder with the actual DuckDB CSV reader
    const replacedSql = sql.replace(/\bdata_table\b/gi, `read_csv_auto('${normalizedPath}', ignore_errors=true)`);
    
    try {
        return await runQuery<any>(replacedSql);
    } catch (error) {
        console.error("Error executing query in queryExecutionService:", error);
        throw new Error(`SQL execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
