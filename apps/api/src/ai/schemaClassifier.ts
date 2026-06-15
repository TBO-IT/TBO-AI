import { DatasetType } from "./datasetTypes.js";

export function classifySchema(columns: string[]): DatasetType {
    const normalizedCols = columns.map(c => c.toLowerCase().trim());

    // Keywords mapping
    const competitivenessKeywords = [
        "competitive status",
        "price_diff_perc",
        "thirdparty_price",
        "tbo_price"
    ];

    const conversionKeywords = [
        "searches",
        "bookings",
        "l2b%",
        "l2v%",
        "vouchered bookings",
        "cancelled bookings",
        "total sales",
        "vouchered sales"
    ];

    let compCount = 0;
    let convCount = 0;

    for (const col of normalizedCols) {
        if (competitivenessKeywords.some(kw => col.includes(kw))) {
            compCount++;
        }
        if (conversionKeywords.some(kw => col.includes(kw))) {
            convCount++;
        }
    }

    if (compCount > 0 && compCount >= convCount) {
        return DatasetType.COMPETITIVENESS;
    } else if (convCount > 0) {
        return DatasetType.CONVERSION;
    }

    return DatasetType.UNKNOWN;
}
