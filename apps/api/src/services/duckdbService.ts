import duckdb from "duckdb";

export interface PerformanceMetric {
  name: string;
  volume: number;
  winRate: number;
}

export interface DatasetSummary {
  rowCount: number;
  winRate: number;
  medianPriceDiff: number;

  apwBreakdown: PerformanceMetric[];
  chainPerformance: PerformanceMetric[];
  supplierPerformance: PerformanceMetric[];
}

function query<T>(
  conn: duckdb.Connection,
  sql: string
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    conn.all(sql, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(rows as T[]);
    });
  });
}

export async function analyzeCsv(
  filePath: string
): Promise<DatasetSummary> {

  const normalizedPath =
    filePath.replaceAll("\\", "/");

  const db = new duckdb.Database(":memory:");
  const conn = db.connect();

  const csvSource = `
    read_csv(
      '${normalizedPath}',
      delim=',',
      header=true,
      quote='"',
      escape='"',
      all_varchar=true
    )
  `;

  const overviewSql = `
    SELECT
      COUNT(*) as rowCount,

      AVG(
        CASE
          WHEN "Competitive Status" = 'Winning'
          THEN 1
          ELSE 0
        END
      ) * 100 as winRate,

      MEDIAN(
        CAST(price_diff_perc AS DOUBLE)
      ) as medianPriceDiff

    FROM ${csvSource}
  `;

  const apwSql = `
    SELECT
      apw_bucket_new as name,

      COUNT(*) as volume,

      AVG(
        CASE
          WHEN "Competitive Status" = 'Winning'
          THEN 1
          ELSE 0
        END
      ) * 100 as winRate

    FROM ${csvSource}

    GROUP BY apw_bucket_new

    ORDER BY volume DESC
  `;

  const chainSql = `
    SELECT
      tbo_chainname as name,

      COUNT(*) as volume,

      AVG(
        CASE
          WHEN "Competitive Status" = 'Winning'
          THEN 1
          ELSE 0
        END
      ) * 100 as winRate

    FROM ${csvSource}

    WHERE
      tbo_chainname IS NOT NULL
      AND TRIM(tbo_chainname) <> ''

    GROUP BY tbo_chainname

    HAVING COUNT(*) > 10

    ORDER BY volume DESC

    LIMIT 15
  `;

  const supplierSql = `
    SELECT
      suppliername as name,

      COUNT(*) as volume,

      AVG(
        CASE
          WHEN "Competitive Status" = 'Winning'
          THEN 1
          ELSE 0
        END
      ) * 100 as winRate

    FROM ${csvSource}

    WHERE
      suppliername IS NOT NULL
      AND TRIM(suppliername) <> ''

    GROUP BY suppliername

    ORDER BY volume DESC
  `;

  const [
    overview,
    apwBreakdown,
    chainPerformance,
    supplierPerformance,
  ] = await Promise.all([
    query<any>(conn, overviewSql),
    query<PerformanceMetric>(conn, apwSql),
    query<PerformanceMetric>(conn, chainSql),
    query<PerformanceMetric>(conn, supplierSql),
  ]);

  conn.close();

  return {
    rowCount: Number(
      overview[0].rowCount
    ),

    winRate: Number(
      overview[0].winRate
    ),

    medianPriceDiff: Number(
      overview[0].medianPriceDiff
    ),

    apwBreakdown: apwBreakdown.map(
      (row) => ({
        name: row.name,
        volume: Number(row.volume),
        winRate: Number(row.winRate),
      })
    ),

    chainPerformance: chainPerformance.map(
      (row) => ({
        name: row.name,
        volume: Number(row.volume),
        winRate: Number(row.winRate),
      })
    ),

    supplierPerformance: supplierPerformance.map(
      (row) => ({
        name: row.name,
        volume: Number(row.volume),
        winRate: Number(row.winRate),
      })
    ),
  };
}

export interface HotelWinMetric {
  hotel: string;
  wins: number;
}

