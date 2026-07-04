import duckdb from "duckdb";

const db = new duckdb.Database(':memory:');
const file = 'uploads/testdata.csv';

const getContext = `
        WITH stats AS (
            SELECT 
                destination,
                percentile_cont(0.25) WITHIN GROUP (ORDER BY TRY_CAST(thirdparty_price AS DOUBLE)) as q1,
                percentile_cont(0.75) WITHIN GROUP (ORDER BY TRY_CAST(thirdparty_price AS DOUBLE)) as q3
            FROM read_csv_auto('${file}', ignore_errors=true)
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
            SELECT 
                d.*, 
                i.upper_bound,
                (TRY_CAST(price_diff_perc AS DOUBLE) IS NOT NULL AND abs(TRY_CAST(price_diff_perc AS DOUBLE)) > 100) as is_perc_outlier,
                (TRY_CAST(thirdparty_price AS DOUBLE) IS NOT NULL AND i.upper_bound IS NOT NULL AND TRY_CAST(thirdparty_price AS DOUBLE) > i.upper_bound) as is_iqr_outlier
            FROM read_csv_auto('${file}', ignore_errors=true) d
            LEFT JOIN iqr_bounds i ON d.destination = i.destination
        )
        SELECT 
            COUNT(*) as total_rows,
            SUM(CASE WHEN is_perc_outlier THEN 1 ELSE 0 END) as perc_outliers,
            SUM(CASE WHEN is_iqr_outlier THEN 1 ELSE 0 END) as iqr_outliers
        FROM raw_data
`;

db.all(getContext, (err, res) => {
    if (err) console.error("Error:", err);
    console.log("Context Results:", res);
});
