import { DatasetType } from "./datasetTypes.js";
import { DATASET_SCHEMAS } from "../config/datasetSchema.js";

export function classifySchema(columns: string[]): DatasetType {
    const normalizedCols = columns.map(c => c.toLowerCase().trim());

    const competitivenessKeywords = DATASET_SCHEMAS[DatasetType.COMPETITIVENESS].CLASSIFICATION_KEYWORDS;
    const conversionKeywords = DATASET_SCHEMAS[DatasetType.CONVERSION].CLASSIFICATION_KEYWORDS;

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
