import duckdb from "duckdb";

// Use a singleton DuckDB instance for the entire application to prevent OOM
// Creating a new Database(":memory:") for every query creates isolated buffer pools
// that each try to grab 80% of system RAM.
export const db = new duckdb.Database(":memory:");

// Initialize database with safe memory and thread limits for constrained environments like Render
db.exec("PRAGMA memory_limit='512MB'; PRAGMA threads=4;", (err) => {
    if (err) {
        console.error("[DUCKDB_INIT] Failed to set pragmas:", err);
    } else {
        console.log("[DUCKDB_INIT] Initialized singleton instance with 512MB memory limit.");
    }
});

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
 * Raw SQL executor — runs any SQL string directly against the singleton DuckDB instance.
 */
export async function executeSql<T = any>(sql: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
        const conn = db.connect();
        
        conn.all(sql, (err, rows) => {
            // ALWAYS close the connection to prevent memory leaks
            conn.close();
            
            if (err) {
                reject(err);
                return;
            }
            resolve(sanitizeRows<T>(rows));
        });
    });
}

import crypto from "crypto";
import fs from "fs/promises";

const materializedTables = new Set<string>();

/**
 * Ensures the dataset is materialized in DuckDB as a table.
 * @returns The generated table name.
 */
async function ensureMaterialized(csvPath: string): Promise<string> {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    let mtime = 0;
    try {
        const stat = await fs.stat(normalizedPath);
        mtime = stat.mtimeMs;
    } catch (e) {
        console.warn(`[DUCKDB_CACHE] Could not stat ${normalizedPath}, falling back to path-only hash`);
    }
    
    const hash = crypto.createHash("md5").update(`${normalizedPath}_${mtime}`).digest("hex");
    const tableName = `ds_${hash}`;

    if (materializedTables.has(tableName)) {
        return tableName;
    }

    const cleanDataQuery = `
        CREATE TABLE IF NOT EXISTS ${tableName} AS
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
    `;

    try {
        await executeSql(cleanDataQuery);
        materializedTables.add(tableName);
        console.log(`[DUCKDB_CACHE] Materialized table ${tableName} for ${csvPath}`);
        return tableName;
    } catch (err) {
        console.error(`[DUCKDB_CACHE] Failed to materialize ${tableName}`, err);
        throw err;
    }
}

/**
 * Semantic-aware query executor.
 * Replaces the "data_table" placeholder with the materialized table name
 * before executing, so Claude-generated SQL can always target the logical "data_table" name.
 */
export async function executeQuery<T = any>(
    sql: string,
    csvPath: string
): Promise<T[]> {
    const tableName = await ensureMaterialized(csvPath);

    const executableSql = sql.replace(
        /\bdata_table\b/gi,
        tableName
    );
    return executeSql<T>(executableSql);
}