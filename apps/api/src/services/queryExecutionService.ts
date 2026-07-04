import duckdb from "duckdb";

/**
 * Converts any BigInt values in a row to Number so that JSON.stringify works.
 * DuckDB returns BIGINT columns as native JS BigInt which is not JSON-serializable.
 */
function sanitizeRows<T>(rows: any[]): T[] {
    return rows.map(row => {
        const clean: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(row)) {
            clean[key] = typeof val === "bigint" ? Number(val) : val;
        }
        return clean as T;
    });
}

/**
 * Raw SQL executor — runs any SQL string directly against an in-memory DuckDB instance.
 */
export async function executeSql<T = any>(
    sql: string
): Promise<T[]> {

    const db =
        new duckdb.Database(":memory:");

    const conn =
        db.connect();

    return new Promise(
        (resolve, reject) => {

            conn.all(
                sql,

                (err, rows) => {

                    if (err) {
                        reject(err);
                        return;
                    }

                    resolve(
                        sanitizeRows<T>(rows)
                    );

                }
            );

        }
    );

}

/**
 * Semantic-aware query executor.
 * Replaces the "data_table" placeholder with read_csv_auto(<csvPath>, ignore_errors=true)
 * before executing, so Claude-generated SQL can always target the logical "data_table" name.
 */
export async function executeQuery<T = any>(
    sql: string,
    csvPath: string
): Promise<T[]> {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    
    // Rule 3: Dual Outlier Audits
    // a. abs(price_diff_perc) <= 100
    // b. thirdparty_price <= Q3 + 5*IQR per destination
    const cleanDataSubquery = `
        (
            WITH stats AS (
                SELECT 
                    destination,
                    percentile_cont(0.25) WITHIN GROUP (ORDER BY TRY_CAST(thirdparty_price AS DOUBLE)) as q1,
                    percentile_cont(0.75) WITHIN GROUP (ORDER BY TRY_CAST(thirdparty_price AS DOUBLE)) as q3
                FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
                GROUP BY destination
            ),
            iqr_bounds AS (
                SELECT 
                    destination,
                    q1,
                    q3,
                    (q3 - q1) as iqr,
                    q3 + (5 * (q3 - q1)) as upper_bound
                FROM stats
            ),
            raw_data AS (
                SELECT d.*, i.upper_bound
                FROM read_csv_auto('${normalizedPath}', ignore_errors=true) d
                LEFT JOIN iqr_bounds i ON d.destination = i.destination
            )
            SELECT *
            FROM raw_data
            WHERE 
                (TRY_CAST(price_diff_perc AS DOUBLE) IS NULL OR abs(TRY_CAST(price_diff_perc AS DOUBLE)) <= 100)
                AND (TRY_CAST(thirdparty_price AS DOUBLE) IS NULL OR upper_bound IS NULL OR TRY_CAST(thirdparty_price AS DOUBLE) <= upper_bound)
        )
    `;

    const executableSql = sql.replace(
        /\bdata_table\b/gi,
        cleanDataSubquery
    );
    return executeSql<T>(executableSql);
}