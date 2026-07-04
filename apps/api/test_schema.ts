import { PrismaClient } from '@prisma/client';
import duckdb from "duckdb";

const prisma = new PrismaClient();

async function run() {
    const dataset = await prisma.dataset.findFirst({
        where: { id: "demo" }
    });
    console.log("Demo dataset:", dataset);
    
    // The codebase mentions "demo" dataset uses some static path or fallback.
    // Let's check a real dataset in DB.
    const realDataset = await prisma.dataset.findFirst({
        where: { type: "COMPETITIVENESS" },
        orderBy: { createdAt: "desc" }
    });
    console.log("Real dataset:", realDataset);
    
    if (realDataset?.storagePath) {
        const db = new duckdb.Database(':memory:');
        db.all(`SELECT * FROM read_csv_auto('${realDataset.storagePath}') LIMIT 1;`, (err, res) => {
            if (err) console.error(err);
            console.log("Columns:", Object.keys(res[0] || {}));
            console.log("Sample row:", res[0]);
        });
        
        db.all(`SELECT COUNT(DISTINCT scraped_date) as dates FROM read_csv_auto('${realDataset.storagePath}')`, (err, res) => {
            console.log("Dates:", res);
        });
    }
}
run();
