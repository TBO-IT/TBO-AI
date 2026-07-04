import duckdb from "duckdb";
import { EntityIndex, EMPTY_ENTITY_INDEX } from "./EntityIndex.js";

function runQuery<T>(
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

async function distinctValues(
    conn: duckdb.Connection,
    src: string,
    column: string
): Promise<string[]> {

    try {

        const rows = await runQuery<{ value: string }>(
            conn,
            `
            SELECT DISTINCT "${column}" as value
            FROM ${src}
            WHERE "${column}" IS NOT NULL
              AND TRIM("${column}") <> ''
            LIMIT 1000
            `
        );

        return rows
            .map(r => String(r.value).trim())
            .filter(Boolean);

    } catch {

        return [];
    }

}

import { db } from "../../services/queryExecutionService.js";

export async function buildEntityIndex(
    filePath: string
): Promise<EntityIndex> {

    const normalized = filePath.replaceAll("\\", "/");

    const conn = db.connect();

    const src = `read_csv_auto('${normalized}', ignore_errors=true)`;

    try {

        const index: EntityIndex = structuredClone(
            EMPTY_ENTITY_INDEX
        );

        index.chain =
            await distinctValues(conn, src, "tbo_chainname");

        index.destination =
            await distinctValues(conn, src, "destination");

        index.hotel =
            await distinctValues(conn, src, "tbo_hotelname");

        index.supplier =
            await distinctValues(conn, src, "suppliername");

        index.city =
            await distinctValues(conn, src, "city");

        index.country =
            await distinctValues(conn, src, "country");

        index.apw =
            await distinctValues(conn, src, "apw_bucket_new");

        index.competitor =
            await distinctValues(conn, src, "thirdparty");

        index.contractingManager =
            await distinctValues(conn, src, "contracting_manager");

        return index;

    } finally {

        conn.close();

    }

}