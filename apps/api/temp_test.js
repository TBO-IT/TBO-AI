import duckdb from "duckdb";

const db = new duckdb.Database(':memory:');
const file = 'uploads/testdata.csv';

db.all(`SELECT * FROM read_csv_auto('${file}') LIMIT 1`, (err, res) => {
    if (err) console.error("SELECT error:", err);
    const schema = Object.keys(res?.[0] || {});
    console.log("Schema:", schema);
    
    const dateCol = schema.find((c) => ['search_date', 'scraped_date', 'date'].includes(c.toLowerCase()));
    console.log("Found dateCol:", dateCol);
    
    if (dateCol) {
        const query = `
            WITH data_table AS (
                SELECT * FROM read_csv_auto('${file}')
            ),
            weekly AS (
                SELECT 
                    date_trunc('week', COALESCE(TRY_CAST("${dateCol}" AS DATE), try_strptime("${dateCol}", '%m/%d/%Y')::DATE, try_strptime("${dateCol}", '%d/%m/%Y')::DATE)) as week,
                    AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as win_rate,
                    AVG(CAST(price_diff_perc AS DOUBLE)) as avg_gap,
                    AVG(CASE WHEN CAST(apw AS INTEGER) < 10 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d10
                FROM data_table
                GROUP BY week
                ORDER BY week ASC
            )
            SELECT * FROM weekly WHERE week IS NOT NULL LIMIT 10
        `;
        
        db.all(query, (err2, res2) => {
            if (err2) console.error("Query error:", err2);
            console.log("Trend Data Result:", res2);
        });
    }
});
