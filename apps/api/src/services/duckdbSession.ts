import duckdb from "duckdb";

export class DuckDBSession {

    private db: duckdb.Database;

    private conn: duckdb.Connection;

    constructor() {
        this.db = new duckdb.Database(":memory:");
        this.conn = this.db.connect();
    }

    async loadCsv(csvPath: string) {

        const normalized = csvPath.replace(/\\/g, "/");

        await new Promise<void>((resolve, reject) => {

            this.conn.run(
                `
                CREATE TEMP TABLE dataset AS
                SELECT *
                FROM read_csv_auto(
                    '${normalized}',
                    ignore_errors=true
                );
                `,
                err => {

                    if (err) reject(err);
                    else resolve();

                }

            );

        });

    }

    async query<T>(sql: string): Promise<T[]> {

        return new Promise((resolve, reject) => {

            this.conn.all(sql, (err, rows) => {

                if (err) reject(err);

                else resolve(rows as T[]);

            });

        });

    }

    async close() {

        await new Promise<void>(resolve =>
            this.conn.close(resolve)
        );

        await new Promise<void>(resolve =>
            this.db.close(resolve)
        );

    }

}