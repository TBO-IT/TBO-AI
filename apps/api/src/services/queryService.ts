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

export async function getTopWinningHotels(
    csvPath: string
): Promise<HotelWins[]> {

    const normalizedPath = csvPath.replace(/\\/g, "/");

    const sql = `
        SELECT
            tbo_hotelname as hotel,
            COUNT(*) as wins

        FROM read_csv(
            '${normalizedPath}',
            delim=',',
            header=true,
            quote='"',
            escape='"',
            all_varchar=true,
            ignore_errors=true
        )

        WHERE "Competitive Status" = 'Winning'

        GROUP BY tbo_hotelname

        ORDER BY wins DESC

        LIMIT 5
    `;

    return runQuery<HotelWins>(
        sql
    );

}
export async function getTopSuppliersByVolume(
    csvPath: string
): Promise<RankedMetric[]> {

    const normalizedPath = csvPath.replace(/\\/g, "/");

    const sql = `
        SELECT
            CAST(suppliername AS VARCHAR) as name,
            COUNT(*) as volume

        FROM read_csv(
            '${normalizedPath}',
            delim=',',
            header=true,
            quote='"',
            escape='"',
            all_varchar=true,
            ignore_errors=true
        )

        WHERE suppliername IS NOT NULL

        GROUP BY suppliername

        ORDER BY volume DESC

        LIMIT 10
    `;

    return runQuery<RankedMetric>(
        sql
    );

}