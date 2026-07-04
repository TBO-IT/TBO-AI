import duckdb from "duckdb";
const db = new duckdb.Database(':memory:');
const csv = "/Users/aaryandidwania/Desktop/TBO/june_data_all_destinations.csv";
const sql = `
WITH raw_data AS (
    SELECT * FROM read_csv_auto('${csv}', ignore_errors=true)
),
overall AS (
    SELECT
        COUNT(*) AS total_rows,
        SUM(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) AS overall_metric
    FROM raw_data
    WHERE "destination" ILIKE '%dubai%'
),
by_dim AS (
    SELECT
        "tbo_chainname" AS dimension_value,
        COUNT(*) AS row_count,
        SUM(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) AS metric_value
    FROM raw_data
    WHERE "destination" ILIKE '%dubai%'
    GROUP BY "tbo_chainname"
)
SELECT
    b.dimension_value AS "Chain",
    b.row_count AS "Volume"
FROM by_dim b CROSS JOIN overall o
WHERE b.dimension_value IS NOT NULL LIMIT 5;
`;

db.all(sql, (err, rows) => {
    if (err) console.error(err);
    else console.log("CHAIN ROWS:", rows);
});
