export interface SummarizedResult {
    rowCount: number;
    sampleRows: any[]; // The top few rows to give Claude context
    columns: string[];
    aggregates: Record<string, { min: number; max: number; sum: number; avg: number }>;
}

/**
 * Compresses large result sets from DuckDB into a token-efficient summary.
 * NEVER send 1000+ raw rows to the LLM.
 */
export function summarizeResults(rows: any[]): string {
    if (!rows || rows.length === 0) {
        return "No data returned.";
    }

    const rowCount = rows.length;
    const columns = Object.keys(rows[0]);
    
    // We only need to show Claude the top 10 rows to establish the pattern/ranking
    const MAX_ROWS_TO_SHOW = 10;
    const sampleRows = rows.slice(0, MAX_ROWS_TO_SHOW);

    // Calculate aggregates for numeric columns if there are many rows
    const aggregates: Record<string, { min: number; max: number; sum: number; avg: number; count: number }> = {};
    
    if (rowCount > 1) {
        for (const col of columns) {
            // Check if first row is a number
            if (typeof rows[0][col] === "number") {
                aggregates[col] = { min: Infinity, max: -Infinity, sum: 0, avg: 0, count: 0 };
            }
        }

        for (const row of rows) {
            for (const col in aggregates) {
                const val = row[col];
                if (typeof val === "number" && !isNaN(val)) {
                    const agg = aggregates[col];
                    if (val < agg.min) agg.min = val;
                    if (val > agg.max) agg.max = val;
                    agg.sum += val;
                    agg.count++;
                }
            }
        }

        for (const col in aggregates) {
            const agg = aggregates[col];
            if (agg.count > 0) {
                agg.avg = agg.sum / agg.count;
            } else {
                delete aggregates[col]; // remove if no valid numbers were found
            }
        }
    }

    const summary: SummarizedResult = {
        rowCount,
        columns,
        sampleRows,
        // Only include aggregates if there are enough rows to make it useful
        aggregates: rowCount > MAX_ROWS_TO_SHOW ? aggregates : {}
    };

    return JSON.stringify(summary, null, 2);
}
