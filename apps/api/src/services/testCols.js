import duckdb from "duckdb";

const db = new duckdb.Database(":memory:");

db.all("SELECT * FROM 'c:/Users/aaryan.didwania/.gemini/antigravity-ide/brain/c2900a1f-b200-44d5-8841-ad2eccc0379b/tmp/da734928-7646-4637-b368-fa63d71f3666-data_may_to_june.csv' LIMIT 1", (err, rows) => {
    if (err) console.error("ERR:", err);
    else {
        console.log("Columns:", Object.keys(rows[0]));
    }
});
