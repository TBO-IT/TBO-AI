import duckdb from "duckdb";
import { logger } from "../lib/logger.js";
export async function runQuery(sql) {
    const db = new duckdb.Database(":memory:");
    const conn = db.connect();
    return new Promise((resolve, reject) => {
        conn.all(sql, (err, rows) => {
            conn.close(() => {
                db.close(() => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(rows);
                });
            });
        });
    });
}
// --- HELPERS ---
async function getDestinationColumn(csvPath) {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    try {
        const columns = await runQuery(`DESCRIBE SELECT * FROM read_csv_auto('${normalizedPath}', ignore_errors=true)`);
        const destCol = columns.find(col => col.column_name.toLowerCase().includes("destination"));
        return destCol ? destCol.column_name : null;
    }
    catch (e) {
        logger.error({ err: e }, "Error describing schema for destination detection");
        return null;
    }
}
// --- HOTELS ---
export async function getTopWinningHotels(csvPath) {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            tbo_hotelname as hotel,
            COUNT(*) as wins
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
        WHERE "Competitive Status" = 'Winning'
          AND tbo_hotelname IS NOT NULL
        GROUP BY tbo_hotelname
        ORDER BY wins DESC
        LIMIT 5
    `;
    return runQuery(sql);
}
export async function getBestHotels(csvPath) {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            tbo_hotelname as hotel,
            COUNT(*) as volume,
            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1.0 ELSE 0.0 END) * 100 as winRate
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
        WHERE tbo_hotelname IS NOT NULL
        GROUP BY tbo_hotelname
        HAVING COUNT(*) >= 20
        ORDER BY winRate DESC, volume DESC
        LIMIT 10
    `;
    return runQuery(sql);
}
export async function getWorstHotels(csvPath) {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            tbo_hotelname as hotel,
            COUNT(*) as volume,
            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1.0 ELSE 0.0 END) * 100 as winRate
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
        WHERE tbo_hotelname IS NOT NULL
        GROUP BY tbo_hotelname
        HAVING COUNT(*) >= 20
        ORDER BY winRate ASC, volume DESC
        LIMIT 10
    `;
    return runQuery(sql);
}
export async function getHighestVolumeHotels(csvPath) {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            tbo_hotelname as hotel,
            COUNT(*) as volume
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
        WHERE tbo_hotelname IS NOT NULL
        GROUP BY tbo_hotelname
        ORDER BY volume DESC
        LIMIT 10
    `;
    return runQuery(sql);
}
// --- SUPPLIERS ---
export async function getTopSuppliersByVolume(csvPath) {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            suppliername as supplier,
            COUNT(*) as volume
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
        WHERE suppliername IS NOT NULL
        GROUP BY suppliername
        ORDER BY volume DESC
        LIMIT 10
    `;
    return runQuery(sql);
}
export async function getBestSuppliers(csvPath) {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            suppliername as supplier,
            COUNT(*) as volume,
            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1.0 ELSE 0.0 END) * 100 as winRate
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
        WHERE suppliername IS NOT NULL
        GROUP BY suppliername
        HAVING COUNT(*) >= 20
        ORDER BY winRate DESC, volume DESC
        LIMIT 10
    `;
    return runQuery(sql);
}
export async function getWorstSuppliers(csvPath) {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            suppliername as supplier,
            COUNT(*) as volume,
            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1.0 ELSE 0.0 END) * 100 as winRate
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
        WHERE suppliername IS NOT NULL
        GROUP BY suppliername
        HAVING COUNT(*) >= 20
        ORDER BY winRate ASC, volume DESC
        LIMIT 10
    `;
    return runQuery(sql);
}
// --- CHAINS ---
export async function getBestChains(csvPath) {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            tbo_chainname as chain,
            COUNT(*) as volume,
            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1.0 ELSE 0.0 END) * 100 as winRate
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
        WHERE tbo_chainname IS NOT NULL AND TRIM(tbo_chainname) <> ''
        GROUP BY tbo_chainname
        HAVING COUNT(*) >= 20
        ORDER BY winRate DESC, volume DESC
        LIMIT 10
    `;
    return runQuery(sql);
}
export async function getWorstChains(csvPath) {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            tbo_chainname as chain,
            COUNT(*) as volume,
            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1.0 ELSE 0.0 END) * 100 as winRate
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
        WHERE tbo_chainname IS NOT NULL AND TRIM(tbo_chainname) <> ''
        GROUP BY tbo_chainname
        HAVING COUNT(*) >= 20
        ORDER BY winRate ASC, volume DESC
        LIMIT 10
    `;
    return runQuery(sql);
}
export async function getHighestVolumeChains(csvPath) {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            tbo_chainname as chain,
            COUNT(*) as volume
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
        WHERE tbo_chainname IS NOT NULL AND TRIM(tbo_chainname) <> ''
        GROUP BY tbo_chainname
        ORDER BY volume DESC
        LIMIT 10
    `;
    return runQuery(sql);
}
// --- MARKET OVERVIEW ---
export async function getOverallWinRate(csvPath) {
    logger.info({}, "Get overall win rate called");
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1.0 ELSE 0.0 END) * 100 as winRate
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
    `;
    const res = await runQuery(sql);
    return res[0]?.winRate ?? 0;
}
export async function getOverallVolume(csvPath) {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            COUNT(*) as volume
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
    `;
    const res = await runQuery(sql);
    return Number(res[0]?.volume ?? 0);
}
// --- DESTINATIONS ---
export async function getTopDestinations(csvPath) {
    const destCol = await getDestinationColumn(csvPath);
    if (!destCol)
        return [];
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            "${destCol}" as destination,
            COUNT(*) as volume
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
        WHERE "${destCol}" IS NOT NULL AND TRIM("${destCol}") <> ''
        GROUP BY "${destCol}"
        ORDER BY volume DESC
        LIMIT 10
    `;
    return runQuery(sql);
}
export async function getBestDestinations(csvPath) {
    const destCol = await getDestinationColumn(csvPath);
    if (!destCol)
        return [];
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            "${destCol}" as destination,
            COUNT(*) as volume,
            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1.0 ELSE 0.0 END) * 100 as winRate
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
        WHERE "${destCol}" IS NOT NULL AND TRIM("${destCol}") <> ''
        GROUP BY "${destCol}"
        HAVING COUNT(*) >= 20
        ORDER BY winRate DESC, volume DESC
        LIMIT 10
    `;
    return runQuery(sql);
}
export async function getWorstDestinations(csvPath) {
    const destCol = await getDestinationColumn(csvPath);
    if (!destCol)
        return [];
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            "${destCol}" as destination,
            COUNT(*) as volume,
            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1.0 ELSE 0.0 END) * 100 as winRate
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
        WHERE "${destCol}" IS NOT NULL AND TRIM("${destCol}") <> ''
        GROUP BY "${destCol}"
        HAVING COUNT(*) >= 20
        ORDER BY winRate ASC, volume DESC
        LIMIT 10
    `;
    return runQuery(sql);
}
