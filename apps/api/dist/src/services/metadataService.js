import { executeQuery } from "./queryExecutionService.js";
async function getDistinctValues(tempPath, columnName) {
    try {
        const sql = `
            SELECT DISTINCT "${columnName}"
            FROM data_table
            WHERE "${columnName}" IS NOT NULL
            ORDER BY "${columnName}"
        `;
        const rows = await executeQuery(sql, tempPath);
        return rows
            .map(row => row[columnName])
            .filter(Boolean)
            .map(String);
    }
    catch {
        return [];
    }
}
export async function buildDatasetMetadata(tempPath) {
    const [destinations, suppliers, thirdParties, chains, hotels, countries, apwBuckets] = await Promise.all([
        getDistinctValues(tempPath, "destination"),
        getDistinctValues(tempPath, "suppliername"),
        getDistinctValues(tempPath, "thirdparty"),
        getDistinctValues(tempPath, "tbo_chainname"),
        getDistinctValues(tempPath, "tbo_hotelname"),
        getDistinctValues(tempPath, "country"),
        getDistinctValues(tempPath, "apw_bucket_new")
    ]);
    return {
        destinations,
        suppliers,
        thirdParties,
        chains,
        hotels,
        countries,
        apwBuckets
    };
}
