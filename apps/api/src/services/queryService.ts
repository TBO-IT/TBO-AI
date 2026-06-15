import duckdb from "duckdb";

export async function runQuery<T>(
    sql: string
): Promise<T[]> {

    const db =
        new duckdb.Database(":memory:");

    const conn =
        db.connect();

    return new Promise((resolve, reject) => {

        conn.all(
            sql,

            (err, rows) => {
                conn.close(() => {
                    db.close(() => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        resolve(rows as T[]);
                    });
                });
            }
        );

    });

}

// --- INTERFACES & TYPES ---

export interface RankedMetric {
    name: string;
    volume: number;
    winRate?: number;
}

export interface HotelWins {
    hotel: string;
    wins: number;
}
export type HotelWinMetric = HotelWins;

export interface HotelMetric {
    hotel: string;
    volume: number;
    winRate: number;
}

export interface HotelVolume {
    hotel: string;
    volume: number;
}

export interface SupplierVolume {
    supplier: string;
    volume: number;
}

export interface SupplierMetric {
    supplier: string;
    volume: number;
    winRate: number;
}

export interface ChainMetric {
    chain: string;
    volume: number;
    winRate: number;
}

export interface ChainVolume {
    chain: string;
    volume: number;
}

export interface DestinationVolume {
    destination: string;
    volume: number;
}

export interface DestinationMetric {
    destination: string;
    volume: number;
    winRate: number;
}

// --- HELPERS ---

async function getDestinationColumn(csvPath: string): Promise<string | null> {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    try {
        const columns = await runQuery<{ column_name: string }>(
            `DESCRIBE SELECT * FROM read_csv_auto('${normalizedPath}', ignore_errors=true)`
        );
        const destCol = columns.find(col =>
            col.column_name.toLowerCase().includes("destination")
        );
        return destCol ? destCol.column_name : null;
    } catch (e) {
        console.error("Error describing schema for destination detection:", e);
        return null;
    }
}

// --- HOTELS ---

export async function getTopWinningHotels(
    csvPath: string
): Promise<HotelWins[]> {
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
    return runQuery<HotelWins>(sql);
}

export async function getBestHotels(
    csvPath: string
): Promise<HotelMetric[]> {
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
    return runQuery<HotelMetric>(sql);
}

export async function getWorstHotels(
    csvPath: string
): Promise<HotelMetric[]> {
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
    return runQuery<HotelMetric>(sql);
}

export async function getHighestVolumeHotels(
    csvPath: string
): Promise<HotelVolume[]> {
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
    return runQuery<HotelVolume>(sql);
}

// --- SUPPLIERS ---

export async function getTopSuppliersByVolume(
    csvPath: string
): Promise<SupplierVolume[]> {
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
    return runQuery<SupplierVolume>(sql);
}

export async function getBestSuppliers(
    csvPath: string
): Promise<SupplierMetric[]> {
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
    return runQuery<SupplierMetric>(sql);
}

export async function getWorstSuppliers(
    csvPath: string
): Promise<SupplierMetric[]> {
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
    return runQuery<SupplierMetric>(sql);
}

// --- CHAINS ---

export async function getBestChains(
    csvPath: string
): Promise<ChainMetric[]> {
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
    return runQuery<ChainMetric>(sql);
}

export async function getWorstChains(
    csvPath: string
): Promise<ChainMetric[]> {
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
    return runQuery<ChainMetric>(sql);
}

export async function getHighestVolumeChains(
    csvPath: string
): Promise<ChainVolume[]> {
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
    return runQuery<ChainVolume>(sql);
}

// --- MARKET OVERVIEW ---

export async function getOverallWinRate(
    csvPath: string
): Promise<number> {
    console.log(
        "GET OVERALL WIN RATE CALLED"
    );

    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1.0 ELSE 0.0 END) * 100 as winRate
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
    `;
    const res = await runQuery<{ winRate: number }>(sql);
    return res[0]?.winRate ?? 0;
}

export async function getOverallVolume(
    csvPath: string
): Promise<number> {
    const normalizedPath = csvPath.replace(/\\/g, "/");
    const sql = `
        SELECT
            COUNT(*) as volume
        FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
    `;
    const res = await runQuery<{ volume: number }>(sql);
    return Number(res[0]?.volume ?? 0);
}

// --- DESTINATIONS ---

export async function getTopDestinations(
    csvPath: string
): Promise<DestinationVolume[]> {
    const destCol = await getDestinationColumn(csvPath);
    if (!destCol) return [];

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
    return runQuery<DestinationVolume>(sql);
}

export async function getBestDestinations(
    csvPath: string
): Promise<DestinationMetric[]> {
    const destCol = await getDestinationColumn(csvPath);
    if (!destCol) return [];

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
    return runQuery<DestinationMetric>(sql);
}

export async function getWorstDestinations(
    csvPath: string
): Promise<DestinationMetric[]> {
    const destCol = await getDestinationColumn(csvPath);
    if (!destCol) return [];

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
    return runQuery<DestinationMetric>(sql);
}