import { exec } from "child_process";
import { executeQuery } from "./queryExecutionService.js";
import { collectStainlessHelpers } from "@anthropic-ai/sdk/lib/stainless-helper-header.mjs";

export interface DatasetMetadata {
    destinations: string[];
    suppliers: string[];
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
        chains,
        hotels,
        countries,
        apwBuckets
    };

}

