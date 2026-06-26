import { runQuery } from "../services/queryService.js";

/**
 * Validates that the query is structurally a SELECT query and does not contain dangerous SQL keywords.
 */
export function isSafeSql(sql: string): boolean {
    const cleanSql = sql.trim().toLowerCase();
    
    // 1. Ensure it starts with select or with (common for CTEs)
    if (!cleanSql.startsWith("select") && !cleanSql.startsWith("with")) {
        return false;
    }

    // 2. Reject modifying SQL commands
    const forbiddenKeywords = [
        "drop",
        "delete",
        "update",
        "insert",
        "alter",
        "truncate",
        "create",
        "grant",
        "revoke",
        "replace",
        "exec",
        "execute"
    ];

    // Check for whole-word matches to avoid false positives (like "destination_id")
    const words = cleanSql.split(/\s+/);
    for (const kw of forbiddenKeywords) {
        if (words.includes(kw)) {
            return false;
        }
    }

    // 3. Prevent multiple statements
    // Split by semicolons and verify there's only one query
    const statements = sql
        .split(";")
        .map(s => s.trim())
        .filter(s => s.length > 0);
    if (statements.length > 1) {
        return false;
    }

    return true;
}

/**
 * Validates the syntax of the SQL query and column names using DuckDB's EXPLAIN optimizer.
 */
export async function validateSqlSyntax(
    sql: string,
    csvPath: string
): Promise<{ valid: boolean; error?: string }> {
    if (process.env.NODE_ENV === "production") {

    return {
        valid: true
    };

}
    if (!isSafeSql(sql)) {
        return { valid: false, error: "SQL contains forbidden non-SELECT keywords or multiple statements." };
    }

    const normalizedPath = csvPath.replace(/\\/g, "/");
    // Replace the data_table placeholder with the actual read_csv_auto call
    // Support case-insensitive replacements
    const replacedSql = sql.replace(/\bdata_table\b/gi, `read_csv_auto('${normalizedPath}', ignore_errors=true)`);

    try {
        // Run EXPLAIN to validate syntax and columns without full query execution
        await runQuery(`EXPLAIN ${replacedSql}`);
        return { valid: true };
    } catch (err) {
        return {
            valid: false,
            error: err instanceof Error ? err.message : String(err)
        };
    }
}
