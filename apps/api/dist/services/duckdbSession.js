import duckdb from "duckdb";
export class DuckDBSession {
    db;
    conn;
    constructor() {
        this.db = new duckdb.Database(":memory:");
        this.conn = this.db.connect();
    }
    async loadCsv(csvPath) {
        const normalized = csvPath.replace(/\\/g, "/");
        await new Promise((resolve, reject) => {
            this.conn.run(`
                CREATE TEMP TABLE dataset AS
                SELECT *
                FROM read_csv_auto(
                    '${normalized}',
                    ignore_errors=true
                );
                `, err => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    async query(sql) {
        return new Promise((resolve, reject) => {
            this.conn.all(sql, (err, rows) => {
                if (err)
                    reject(err);
                else
                    resolve(rows);
            });
        });
    }
    async close() {
        await new Promise((resolve, reject) => this.conn.close((err) => {
            if (err)
                reject(err);
            else
                resolve();
        }));
        await new Promise((resolve, reject) => this.db.close((err) => {
            if (err)
                reject(err);
            else
                resolve();
        }));
    }
}
