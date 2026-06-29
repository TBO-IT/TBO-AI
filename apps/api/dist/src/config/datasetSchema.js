import { DatasetType } from "../ai/datasetTypes.js";
export const DEFAULT_HEADER_NORMALIZATION = {
    trimWhitespace: true,
    collapseRepeatedSpaces: true,
    caseInsensitive: true,
};
export const DATASET_SCHEMAS = {
    [DatasetType.COMPETITIVENESS]: {
        REQUIRED_COLUMNS: [
            "Competitive Status",
            "price_diff_perc",
            "apw_bucket_new",
            "tbo_chainname",
            "suppliername",
            "thirdparty_price",
            "tbo_price",
        ],
        NUMERIC_COLUMNS: ["price_diff_perc", "thirdparty_price", "tbo_price"],
        DATE_COLUMNS: ["scraped_date"],
        ENUM_COLUMNS: {
            "Competitive Status": ["Winning", "Losing"],
        },
        OPTIONAL_COLUMNS: ["destination", "tbo_hotelname", "thirdparty_hotelname", "apw"],
        HEADER_NORMALIZATION: DEFAULT_HEADER_NORMALIZATION,
        CLASSIFICATION_KEYWORDS: [
            "competitive status",
            "price_diff_perc",
            "thirdparty_price",
            "tbo_price",
            "suppliername",
        ],
    },
    [DatasetType.CONVERSION]: {
        REQUIRED_COLUMNS: ["Searches", "Bookings", "L2B%", "City", "Hotel name"],
        NUMERIC_COLUMNS: [
            "Searches",
            "Bookings",
            "L2B%",
            "L2V%",
            "Vouchered Bookings",
            "Cancelled  Bookings",
            "Total Sales",
            "Vouchered Sales",
        ],
        DATE_COLUMNS: ["Date", "scraped_date"],
        ENUM_COLUMNS: {},
        OPTIONAL_COLUMNS: [
            "Vouchered Bookings",
            "Cancelled  Bookings",
            "Total Sales",
            "Vouchered Sales",
            "L2V%",
        ],
        HEADER_NORMALIZATION: DEFAULT_HEADER_NORMALIZATION,
        CLASSIFICATION_KEYWORDS: [
            "searches",
            "bookings",
            "l2b%",
            "l2v%",
            "vouchered bookings",
            "cancelled bookings",
            "total sales",
            "vouchered sales",
        ],
    },
};
export const REQUIRED_COLUMNS = {
    [DatasetType.COMPETITIVENESS]: DATASET_SCHEMAS[DatasetType.COMPETITIVENESS].REQUIRED_COLUMNS,
    [DatasetType.CONVERSION]: DATASET_SCHEMAS[DatasetType.CONVERSION].REQUIRED_COLUMNS,
};
export const NUMERIC_COLUMNS = {
    [DatasetType.COMPETITIVENESS]: DATASET_SCHEMAS[DatasetType.COMPETITIVENESS].NUMERIC_COLUMNS,
    [DatasetType.CONVERSION]: DATASET_SCHEMAS[DatasetType.CONVERSION].NUMERIC_COLUMNS,
};
export const DATE_COLUMNS = {
    [DatasetType.COMPETITIVENESS]: DATASET_SCHEMAS[DatasetType.COMPETITIVENESS].DATE_COLUMNS,
    [DatasetType.CONVERSION]: DATASET_SCHEMAS[DatasetType.CONVERSION].DATE_COLUMNS,
};
export const ENUM_COLUMNS = {
    [DatasetType.COMPETITIVENESS]: DATASET_SCHEMAS[DatasetType.COMPETITIVENESS].ENUM_COLUMNS,
    [DatasetType.CONVERSION]: DATASET_SCHEMAS[DatasetType.CONVERSION].ENUM_COLUMNS,
};
export const OPTIONAL_COLUMNS = {
    [DatasetType.COMPETITIVENESS]: DATASET_SCHEMAS[DatasetType.COMPETITIVENESS].OPTIONAL_COLUMNS,
    [DatasetType.CONVERSION]: DATASET_SCHEMAS[DatasetType.CONVERSION].OPTIONAL_COLUMNS,
};
export const HEADER_NORMALIZATION = {
    [DatasetType.COMPETITIVENESS]: DATASET_SCHEMAS[DatasetType.COMPETITIVENESS].HEADER_NORMALIZATION,
    [DatasetType.CONVERSION]: DATASET_SCHEMAS[DatasetType.CONVERSION].HEADER_NORMALIZATION,
};
export const HEADER_ALIASES = {
    "competitive_status": "Competitive Status",
    "competitive  status": "Competitive Status",
    "hotel_name": "Hotel name",
    "hotel  name": "Hotel name",
    "l2b": "L2B%",
    "l2b %": "L2B%",
    "l2v": "L2V%",
    "l2v %": "L2V%",
    "vouchered bookings": "Vouchered Bookings",
    "cancelled bookings": "Cancelled  Bookings",
    "cancelled   bookings": "Cancelled  Bookings",
};
export const COMPETITIVENESS_COLUMNS = {
    STATUS: "Competitive Status",
    PRICE_DIFF_PERC: "price_diff_perc",
    APW_BUCKET: "apw_bucket_new",
    CHAIN: "tbo_chainname",
    SUPPLIER: "suppliername",
};
export const CONVERSION_COLUMNS = {
    SEARCHES: "Searches",
    BOOKINGS: "Bookings",
    L2B: "L2B%",
    CITY: "City",
    HOTEL_NAME: "Hotel name",
};
function normalizeWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
}
export function normalizeHeader(rawHeader) {
    const cleaned = normalizeWhitespace(rawHeader);
    const lowered = cleaned.toLowerCase();
    return normalizeWhitespace(HEADER_ALIASES[lowered] ?? cleaned).toLowerCase();
}
export function getDisplayHeaderName(rawHeader) {
    const cleaned = normalizeWhitespace(rawHeader);
    const lowered = cleaned.toLowerCase();
    return HEADER_ALIASES[lowered] ?? cleaned;
}
export function resolveDatasetTypeByHeaders(headers) {
    const normalizedHeaders = headers.map(normalizeHeader);
    let bestType = DatasetType.UNKNOWN;
    let bestScore = -1;
    for (const [datasetType, schema] of Object.entries(DATASET_SCHEMAS)) {
        const keywords = schema.CLASSIFICATION_KEYWORDS.map(normalizeHeader);
        const score = keywords.reduce((acc, keyword) => {
            return acc + (normalizedHeaders.some(h => h.includes(keyword) || keyword.includes(h)) ? 1 : 0);
        }, 0);
        if (score > bestScore) {
            bestType = datasetType;
            bestScore = score;
        }
    }
    return bestScore > 0 ? bestType : DatasetType.UNKNOWN;
}
export function getBestMatchingSchema(headers) {
    const inferredType = resolveDatasetTypeByHeaders(headers);
    if (inferredType !== DatasetType.UNKNOWN) {
        return {
            datasetType: inferredType,
            schema: DATASET_SCHEMAS[inferredType],
        };
    }
    const normalizedHeaders = new Set(headers.map(normalizeHeader));
    const candidates = Object.entries(DATASET_SCHEMAS);
    const ranked = candidates
        .map(([datasetType, schema]) => {
        const matchedRequired = schema.REQUIRED_COLUMNS
            .map(normalizeHeader)
            .filter(col => normalizedHeaders.has(col)).length;
        return { datasetType, schema, matchedRequired };
    })
        .sort((a, b) => b.matchedRequired - a.matchedRequired);
    return {
        datasetType: ranked[0].datasetType,
        schema: ranked[0].schema,
    };
}
