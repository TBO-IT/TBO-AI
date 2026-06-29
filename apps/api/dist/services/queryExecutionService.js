import duckdb from "duckdb";
/**
 * Converts any BigInt values in a row to Number so that JSON.stringify works.
 * DuckDB returns BIGINT columns as native JS BigInt which is not JSON-serializable.
 */
function sanitizeRows(rows) {
    return rows.map(row => {
        const clean = {};
        for (const [key, val] of Object.entries(row)) {
            clean[key] = typeof val === "bigint" ? Number(val) : val;
        }
        return clean;
    });
}
/**
 * Raw SQL executor — runs any SQL string directly against an in-memory DuckDB instance.
 */
export async function executeSql(sql) {
    const db = new duckdb.Database(":memory:");
    const conn = db.connect();
    return new Promise((resolve, reject) => {
        conn.all(sql, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(sanitizeRows(rows));
        });
    });
}
/**
 * Semantic-aware query executor.
 * Replaces the "data_table" placeholder with read_csv_auto(<csvPath>, ignore_errors=true)
 * before executing, so Claude-generated SQL can always target the logical "data_table" name.
 */
export async function executeQuery(sql, csvPath) {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const executableSql = sql.replace(/\bdata_table\b/gi, `read_csv_auto('${normalizedPath}', ignore_errors=true)`);
    return executeSql(executableSql);
}
