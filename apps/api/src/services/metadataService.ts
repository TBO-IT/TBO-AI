import { executeQuery } from "./queryExecutionService.js";

export interface DatasetMetadata {
    destinations: string[];
    suppliers: string[];
    /** Distinct competitor names from the thirdparty column */
    thirdParties: string[];
    chains: string[];
    hotels: string[];
    countries: string[];
    apwBuckets: string[];
}

async function getDistinctValues(
    tempPath: string,
    columnName: string
): Promise<string[]> {

    try {

        const sql = `
            SELECT DISTINCT "${columnName}"
            FROM data_table
            WHERE "${columnName}" IS NOT NULL
            ORDER BY "${columnName}"
        `;

        const rows =
            await executeQuery(
                sql,
                tempPath
            );

        return rows
            .map(
                row =>
                    row[columnName]
            )
            .filter(Boolean)
            .map(String);

    } catch {

        return [];

    }

}

export async function buildDatasetMetadata(
    tempPath: string
): Promise<DatasetMetadata> {
    const [
        destinations,
        suppliers,
        thirdParties,
        chains,
        hotels,
        countries,
        apwBuckets
    ] = await Promise.all([
        getDistinctValues(
            tempPath,
            "destination"
        ),

        getDistinctValues(
            tempPath,
            "suppliername"
        ),

        getDistinctValues(
            tempPath,
            "thirdparty"
        ),

        getDistinctValues(
            tempPath,
            "tbo_chainname"
        ),

        getDistinctValues(
            tempPath,
            "tbo_hotelname"
        ),

        getDistinctValues(
            tempPath,
            "country"
        ),

        getDistinctValues(
            tempPath,
            "apw_bucket_new"
        )

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

