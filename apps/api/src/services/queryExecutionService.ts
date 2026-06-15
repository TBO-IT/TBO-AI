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
    const executableSql = sql.replace(
        /\bdata_table\b/gi,
        `read_csv_auto('${normalizedPath}', ignore_errors=true)`
    );
    return executeSql<T>(executableSql);
}