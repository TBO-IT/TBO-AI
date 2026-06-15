import duckdb from "duckdb";
import { classifySchema } from "../ai/schemaClassifier.js";
import { DatasetType } from "../ai/datasetTypes.js";

// ─── Shared types ────────────────────────────────────────────────────────────

export interface PerformanceMetric {
    name: string;
    volume: number;
    winRate: number;
}

export interface DatasetSummary {
    datasetType: DatasetType;
    rowCount: number;

    // COMPETITIVENESS fields
    winRate?: number;
    medianPriceDiff?: number;
    apwBreakdown?: PerformanceMetric[];
    chainPerformance?: PerformanceMetric[];
    supplierPerformance?: PerformanceMetric[];

    // CONVERSION fields
    totalSearches?: number;
    totalBookings?: number;
    avgL2bRate?: number;
    topCitiesBySearches?: { name: string; searches: number; l2bRate: number }[];
    topHotelsByBookings?: { name: string; bookings: number; l2bRate: number }[];
}

export interface HotelWinMetric {
    hotel: string;
    wins: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function runQuery<T>(conn: duckdb.Connection, sql: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
        conn.all(sql, (err, rows) => {
            if (err) { reject(err); return; }
            resolve(rows as T[]);
        });
    });
}

function n(val: unknown): number {
    return val == null ? 0 : Number(val);
}

// ─── Type-specific analysers ──────────────────────────────────────────────────

async function analyzeCompetitiveness(
    conn: duckdb.Connection,
    src: string
): Promise<Partial<DatasetSummary>> {
    const overviewSql = `
        SELECT
            COUNT(*) as rowCount,
            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as winRate,
            MEDIAN(CAST(price_diff_perc AS DOUBLE)) as medianPriceDiff
        FROM ${src}
    `;

    const apwSql = `
        SELECT apw_bucket_new as name, COUNT(*) as volume,
            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as winRate
        FROM ${src}
        GROUP BY apw_bucket_new ORDER BY volume DESC
    `;

    const chainSql = `
        SELECT tbo_chainname as name, COUNT(*) as volume,
            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as winRate
        FROM ${src}
        WHERE tbo_chainname IS NOT NULL AND TRIM(tbo_chainname) <> ''
        GROUP BY tbo_chainname HAVING COUNT(*) > 10
        ORDER BY volume DESC LIMIT 15
    `;

    const supplierSql = `
        SELECT suppliername as name, COUNT(*) as volume,
            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as winRate
        FROM ${src}
        WHERE suppliername IS NOT NULL AND TRIM(suppliername) <> ''
        GROUP BY suppliername ORDER BY volume DESC
    `;

    const [overview, apwBreakdown, chainPerformance, supplierPerformance] =
        await Promise.all([
            runQuery<any>(conn, overviewSql),
            runQuery<any>(conn, apwSql),
            runQuery<any>(conn, chainSql),
            runQuery<any>(conn, supplierSql),
        ]);

    return {
        rowCount: n(overview[0].rowCount),
        winRate: n(overview[0].winRate),
        medianPriceDiff: n(overview[0].medianPriceDiff),
        apwBreakdown: apwBreakdown.map(r => ({ name: r.name, volume: n(r.volume), winRate: n(r.winRate) })),
        chainPerformance: chainPerformance.map(r => ({ name: r.name, volume: n(r.volume), winRate: n(r.winRate) })),
        supplierPerformance: supplierPerformance.map(r => ({ name: r.name, volume: n(r.volume), winRate: n(r.winRate) })),
    };
}

async function analyzeConversion(
    conn: duckdb.Connection,
    src: string
): Promise<Partial<DatasetSummary>> {
    // Searches and Bookings may be comma-formatted strings (e.g. '79,737')
    // L2B% may be a percent-suffixed string (e.g. '0.00%') — strip both before casting
    const searches = `CAST(REPLACE(CAST(Searches AS VARCHAR), ',', '') AS BIGINT)`;
    const bookings = `CAST(REPLACE(CAST(Bookings AS VARCHAR), ',', '') AS BIGINT)`;
    const l2b      = `CAST(REPLACE(CAST("L2B%" AS VARCHAR), '%', '') AS DOUBLE)`;

    const overviewSql = `
        SELECT
            COUNT(*) as rowCount,
            SUM(${searches}) as totalSearches,
            SUM(${bookings}) as totalBookings,
            AVG(${l2b})      as avgL2bRate
        FROM ${src}
    `;

    const citySql = `
        SELECT
            City as name,
            SUM(${searches}) as searches,
            AVG(${l2b})      as l2bRate
        FROM ${src}
        WHERE City IS NOT NULL AND TRIM(City) <> ''
        GROUP BY City
        ORDER BY searches DESC
        LIMIT 10
    `;

    const hotelSql = `
        SELECT
            "Hotel name" as name,
            SUM(${bookings}) as bookings,
            AVG(${l2b})      as l2bRate
        FROM ${src}
        WHERE "Hotel name" IS NOT NULL AND TRIM("Hotel name") <> ''
        GROUP BY "Hotel name"
        ORDER BY bookings DESC
        LIMIT 10
    `;

    const [overview, topCities, topHotels] = await Promise.all([
        runQuery<any>(conn, overviewSql),
        runQuery<any>(conn, citySql),
        runQuery<any>(conn, hotelSql),
    ]);

    return {
        rowCount: n(overview[0].rowCount),
        totalSearches: n(overview[0].totalSearches),
        totalBookings: n(overview[0].totalBookings),
        avgL2bRate: n(overview[0].avgL2bRate),
        topCitiesBySearches: topCities.map(r => ({ name: r.name, searches: n(r.searches), l2bRate: n(r.l2bRate) })),
        topHotelsByBookings: topHotels.map(r => ({ name: r.name, bookings: n(r.bookings), l2bRate: n(r.l2bRate) })),
    };
}

async function analyzeGeneric(
    conn: duckdb.Connection,
    src: string
): Promise<Partial<DatasetSummary>> {
    const rows = await runQuery<any>(conn, `SELECT COUNT(*) as rowCount FROM ${src}`);
    return { rowCount: n(rows[0].rowCount) };
}

// ─── Schema detection ─────────────────────────────────────────────────────────

async function detectType(conn: duckdb.Connection, src: string): Promise<DatasetType> {
    const cols = await runQuery<{ column_name: string }>(
        conn,
        `DESCRIBE SELECT * FROM ${src}`
    );
    const columnNames = cols.map(c => c.column_name);
    return classifySchema(columnNames);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function analyzeCsv(filePath: string): Promise<DatasetSummary> {
    const normalizedPath = filePath.replaceAll("\\", "/");

    const db = new duckdb.Database(":memory:");
    const conn = db.connect();

    // All CSV reads use ignore_errors=true to handle encoding issues
    const src = `read_csv_auto('${normalizedPath}', ignore_errors=true)`;

    try {
        // 1. Auto-detect dataset type from column names
        const datasetType = await detectType(conn, src);
        console.log(`[analyzeCsv] Detected dataset type: ${datasetType} for ${filePath}`);

        // 2. Run type-specific analysis
        let typeSpecific: Partial<DatasetSummary>;
        switch (datasetType) {
            case DatasetType.COMPETITIVENESS:
                typeSpecific = await analyzeCompetitiveness(conn, src);
                break;
            case DatasetType.CONVERSION:
                typeSpecific = await analyzeConversion(conn, src);
                break;
            default:
                typeSpecific = await analyzeGeneric(conn, src);
                break;
        }

        return { datasetType, ...typeSpecific } as DatasetSummary;

    } finally {
        conn.close();
        // Close the database itself to release any OS-level file handles
        db.close();
    }
}
