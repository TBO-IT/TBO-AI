import { PrismaClient } from '@prisma/client';
import duckdb from "duckdb";

const prisma = new PrismaClient();

async function run() {
    const realDataset = await prisma.dataset.findFirst({
        where: { type: "COMPETITIVENESS" },
        orderBy: { createdAt: "desc" }
    });
    console.log("Real dataset:", realDataset);
    
    if (realDataset?.storagePath) {
        const db = new duckdb.Database(':memory:');
        
        db.all(`DESCRIBE read_csv_auto('${realDataset.storagePath}')`, (err, res) => {
            if (err) console.error("DESCRIBE error:", err);
            console.log("Schema:", res?.map((c: any) => c.column_name));
            
            const dateCol = res?.find((c: any) => ['search_date', 'scraped_date', 'date'].includes(c.column_name.toLowerCase()))?.column_name;
            console.log("Found dateCol:", dateCol);
            
            if (dateCol) {
                const query = `
                    WITH data_table AS (
                        SELECT * FROM read_csv_auto('${realDataset.storagePath}')
                    ),
                    weekly AS (
                        SELECT 
                            date_trunc('week', CAST("${dateCol}" AS TIMESTAMP)) as week,
                            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as win_rate,
                            AVG(CAST(price_diff_perc AS DOUBLE)) as avg_gap
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
    }
}
run();
