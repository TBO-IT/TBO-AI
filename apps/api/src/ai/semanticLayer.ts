import { DatasetColumn, SemanticLayer, BusinessDefinition, MetricDefinition } from "./llmtypes.js";
import { DatasetType } from "./datasetTypes.js";
import { classifySchema } from "./schemaClassifier.js";
import { BUSINESS_KNOWLEDGE } from "./businessKnowledge.js";
import { METRIC_REGISTRY } from "./metricRegistry.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnrichedSemanticLayer extends SemanticLayer {
    datasetType: DatasetType;

    /** Canonical dimension keys found (e.g. ["destination", "supplier"]) */
    dimensions: string[];

    /** Canonical metric keys available for this dataset type */
    metricKeys: string[];

    /** Maps physical column name → canonical dimension/concept name */
    columnMappings: Record<string, string>;

    /** All physical columns from the schema */
    allColumns: DatasetColumn[];
}

// ─── Time column detection ────────────────────────────────────────────────────

const DATE_COLUMN_PATTERNS = [
    "date", "time", "timestamp", "datetime",
    "scraped_date", "scrapeddate",
    "booking_date", "bookingdate",
    "checkin", "check_in", "checkout", "check_out",
    "created_at", "updated_at", "inserted_at",
    "period", "month", "week", "year"
];

const DATE_TYPES = ["date", "timestamp", "timestamptz", "datetime"];

function detectTimeColumns(schema: DatasetColumn[]): { primary: string; all: string[] } {
    const allTime: string[] = [];

    schema.forEach(col => {
        const nameLower = col.column_name.toLowerCase();
        const typeLower = col.column_type.toLowerCase();

        const isDateByType = DATE_TYPES.some(t => typeLower.includes(t));
        const isDateByName = DATE_COLUMN_PATTERNS.some(p => nameLower.includes(p));

        if (isDateByType || isDateByName) {
            allTime.push(col.column_name);
        }
    });

    // Determine primary using preference order
    const preferences = [
        "scraped_date", "scrapeddate", "date",
        "checkin", "checkout", "booking_date", "created_at"
    ];

    let primary = "";
    const allLower = allTime.map(c => c.toLowerCase());

    for (const pref of preferences) {
        const idx = allLower.indexOf(pref);
        if (idx !== -1) { primary = allTime[idx]; break; }
    }

    // If no preference matched, use first detected
    if (!primary && allTime.length > 0) {
        primary = allTime[0];
    }

    return { primary, all: allTime };
}

// ─── Dimension mapping ────────────────────────────────────────────────────────

interface DimensionMatcher {
    canonicalKey: string;
    matches: string[];
}

const DIMENSION_MATCHERS: DimensionMatcher[] = [
    { canonicalKey: "destination", matches: ["destination"] },
    { canonicalKey: "supplier",    matches: ["suppliername", "supplier"] },
    { canonicalKey: "hotel",       matches: ["tbo_hotelname", "hotel name", "hotel_name"] },
    { canonicalKey: "chain",       matches: ["tbo_chainname", "chain", "chainname"] },
    { canonicalKey: "city",        matches: ["city"] },
    { canonicalKey: "country",     matches: ["country"] },
    { canonicalKey: "hotel_id",    matches: ["hotel id", "hotel_id"] }
];

function mapDimensions(schema: DatasetColumn[]): {
    dimensions: string[];
    columnMappings: Record<string, string>;
} {
    const dimensions: string[] = [];
    const columnMappings: Record<string, string> = {};

    schema.forEach(col => {
        const nameLower = col.column_name.toLowerCase();
        for (const matcher of DIMENSION_MATCHERS) {
            if (matcher.matches.includes(nameLower)) {
                if (!dimensions.includes(matcher.canonicalKey)) {
                    dimensions.push(matcher.canonicalKey);
                }
                columnMappings[col.column_name] = matcher.canonicalKey;
                break;
            }
        }
    });

    return { dimensions, columnMappings };
}

// ─── Metric resolution ────────────────────────────────────────────────────────

const DATASET_METRIC_KEYS: Record<DatasetType, string[]> = {
    [DatasetType.COMPETITIVENESS]: ["win_rate", "avg_price_diff", "median_price_diff"],
    [DatasetType.CONVERSION]:      [
        "searches", "bookings", "vouchered_bookings", "cancelled_bookings",
        "total_sales", "vouchered_sales", "cancel_sales", "l2b", "l2v"
    ],
    [DatasetType.REVENUE]:  ["total_sales", "vouchered_sales", "cancel_sales"],
    [DatasetType.UNKNOWN]:  []
};

function resolveMetrics(datasetType: DatasetType): MetricDefinition[] {
    const keys = DATASET_METRIC_KEYS[datasetType] ?? [];
    return keys
        .map(key => METRIC_REGISTRY[key])
        .filter(Boolean)
        .map(m => ({ name: m.name, description: m.description, formula: m.formula }));
}

// ─── Business definitions ──────────────────────────────────────────────────────

function resolveBusinessDefinitions(dimensions: string[]): BusinessDefinition[] {
    return dimensions.map(dim => {
        const concept = (BUSINESS_KNOWLEDGE.concepts as Record<string, { description: string }>)[dim];
        return {
            name: dim,
            definition: concept?.description ??
                `${dim.charAt(0).toUpperCase() + dim.slice(1)} dimension of the dataset.`
        };
    });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds a fully enriched semantic layer from raw DuckDB schema columns.
 *
 * The output contains everything needed for:
 * - Question validation (metricKeys, dimensions, availableTimeColumns)
 * - Prompt building (metrics formulas, businessDefinitions, columnMappings)
 * - Future multi-dataset joins (datasetType, columnMappings)
 */
export function buildSemanticLayer(schema: DatasetColumn[]): EnrichedSemanticLayer {
    const columnNames = schema.map(c => c.column_name);
    const datasetType = classifySchema(columnNames);

    const { primary: primaryTimeDimension, all: availableTimeColumns } = detectTimeColumns(schema);
    const { dimensions, columnMappings } = mapDimensions(schema);
    const metrics = resolveMetrics(datasetType);
    const metricKeys = DATASET_METRIC_KEYS[datasetType] ?? [];
    const businessDefinitions = resolveBusinessDefinitions(dimensions);

    return {
        datasetType,
        dimensions,
        metricKeys,
        primaryTimeDimension,
        availableTimeColumns,
        columnMappings,
        businessDefinitions,
        metrics,
        allColumns: schema
    };
}
