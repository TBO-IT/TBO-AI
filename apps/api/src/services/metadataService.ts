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
    /** Distinct contracting manager names from the contracting_manager column */
    contractingManagers: string[];
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

async function getDistinctValuesWithFallback(
    tempPath: string,
    columnNames: string[]
): Promise<string[]> {
    for (const col of columnNames) {
        const values = await getDistinctValues(tempPath, col);
        if (values.length > 0) return values;
    }
    return [];
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
        apwBuckets,
        contractingManagers
    ] = await Promise.all([
        getDistinctValuesWithFallback(tempPath, ["destination", "Destination"]),
        getDistinctValuesWithFallback(tempPath, ["suppliername", "supplier", "SupplierName", "Supplier"]),
        getDistinctValuesWithFallback(tempPath, ["thirdparty", "third_party", "competitor", "ThirdParty"]),
        getDistinctValuesWithFallback(tempPath, ["tbo_chainname", "chain", "chainname", "Chain"]),
        getDistinctValuesWithFallback(tempPath, ["tbo_hotelname", "hotel name", "hotel_name", "hotel", "Hotel"]),
        getDistinctValuesWithFallback(tempPath, ["country", "Country"]),
        getDistinctValuesWithFallback(tempPath, ["apw_bucket_new", "apw_bucket", "apw", "lead time bucket", "APW"]),
        getDistinctValuesWithFallback(tempPath, ["contracting_manager"])
    ]);

    return {
        destinations,
        suppliers,
        thirdParties,
        chains,
        hotels,
        countries,
        apwBuckets,
        contractingManagers
    };

}

export async function getDatasetContext(tempPath: string) {
    const normalizedPath = tempPath.replace(/\\/g, "/");
    
    // Calculate outlier counts and metadata
    const sql = `
        WITH stats AS (
            SELECT 
                destination,
                percentile_cont(0.25) WITHIN GROUP (ORDER BY TRY_CAST(thirdparty_price AS DOUBLE)) as q1,
                percentile_cont(0.75) WITHIN GROUP (ORDER BY TRY_CAST(thirdparty_price AS DOUBLE)) as q3
            FROM read_csv_auto('${normalizedPath}', ignore_errors=true)
            GROUP BY destination
        ),
        iqr_bounds AS (
            SELECT 
                destination,
                q1,
                q3,
                (q3 - q1) as iqr,
                q3 + (5 * (q3 - q1)) as upper_bound
            FROM stats
        ),
        raw_data AS (
            SELECT 
                d.*, 
                i.upper_bound,
                (TRY_CAST(price_diff_perc AS DOUBLE) IS NOT NULL AND abs(TRY_CAST(price_diff_perc AS DOUBLE)) > 100) as is_perc_outlier,
                (TRY_CAST(thirdparty_price AS DOUBLE) IS NOT NULL AND i.upper_bound IS NOT NULL AND TRY_CAST(thirdparty_price AS DOUBLE) > i.upper_bound) as is_iqr_outlier,
                TRY_CAST(COALESCE(try_strptime(scraped_date, '%m/%d/%Y'), try_strptime(scraped_date, '%d/%m/%Y'), try_strptime(scraped_date, '%Y-%m-%d')) AS DATE) as s_date
            FROM read_csv_auto('${normalizedPath}', ignore_errors=true) d
            LEFT JOIN iqr_bounds i ON d.destination = i.destination
        )
        SELECT 
            COUNT(*) as total_rows,
            SUM(CASE WHEN is_perc_outlier THEN 1 ELSE 0 END) as perc_outliers,
            SUM(CASE WHEN is_iqr_outlier THEN 1 ELSE 0 END) as iqr_outliers,
            MIN(s_date) as min_date,
            MAX(s_date) as max_date
        FROM raw_data
    `;
    
    const rows = await executeQuery(sql, tempPath);
    const row = rows[0] || {};
    
    const competitors = await getDistinctValues(tempPath, "thirdparty");
    
    return {
        currency: "absolute units (derived from thirdparty_price)",
        dateRange: {
            min: row.min_date ? String(row.min_date) : "N/A",
            max: row.max_date ? String(row.max_date) : "N/A"
        },
        competitorsPresent: competitors,
        outliersDropped: {
            magnitude: Number(row.iqr_outliers || 0),
            percentage: Number(row.perc_outliers || 0)
        },
        knownLimitations: [
            "Cannot answer booking volume, conversion rate, or margin queries.",
            "Historical trends are limited to the exact scrape dates present in the file."
        ],
        changelog: [
            "Added Dual Outlier Audits (IQR and Percentage limits).",
            "Added Reliability sample size flags to all aggregates.",
            "Added Cross-Tabs for advanced drill-downs."
        ]
    };
}

