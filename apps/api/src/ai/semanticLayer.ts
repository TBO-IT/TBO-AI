import { DatasetColumn, SemanticLayer, BusinessDefinition, MetricDefinition } from "./llmtypes.js";
import { DatasetType } from "./datasetTypes.js";
import { classifySchema } from "./schemaClassifier.js";
import { BUSINESS_KNOWLEDGE } from "./businessKnowledge.js";
import { METRIC_REGISTRY } from "./metricRegistry.js";

export interface EnrichedSemanticLayer extends SemanticLayer {
    datasetType: DatasetType;
    dimensions: string[];
    columnMappings: Record<string, string>; // Maps physical columns -> business dimension/concept name
    allColumns: DatasetColumn[];
}

export function buildSemanticLayer(schema: DatasetColumn[]): EnrichedSemanticLayer {
    const columnNames = schema.map(c => c.column_name);
    const datasetType = classifySchema(columnNames);

    // 1. Determine Primary Time Dimension
    let primaryTimeDimension: string = "";
    const lowerColumnNames = columnNames.map(c => c.toLowerCase());
    
    // Ordered preference for time dimensions
    const timePreferences = ["scraped_date", "scrapeddate", "date", "checkin", "checkout", "timestamp", "time"];
    for (const pref of timePreferences) {
        const idx = lowerColumnNames.indexOf(pref);
        if (idx !== -1) {
            primaryTimeDimension = columnNames[idx];
            break;
        }
    }

    // 2. Map Columns to Business Dimensions
    const dimensions: string[] = [];
    const columnMappings: Record<string, string> = {};

    schema.forEach(col => {
        const nameLower = col.column_name.toLowerCase();
        if (nameLower === "destination") {
            dimensions.push("destination");
            columnMappings[col.column_name] = "destination";
        } else if (nameLower === "suppliername" || nameLower === "supplier") {
            dimensions.push("supplier");
            columnMappings[col.column_name] = "supplier";
        } else if (nameLower === "tbo_hotelname" || nameLower === "hotel name" || nameLower === "hotel_name") {
            dimensions.push("hotel");
            columnMappings[col.column_name] = "hotel";
        } else if (nameLower === "tbo_chainname" || nameLower === "chain" || nameLower === "chainname") {
            dimensions.push("chain");
            columnMappings[col.column_name] = "chain";
        } else if (nameLower === "city") {
            dimensions.push("city");
            columnMappings[col.column_name] = "city";
        } else if (nameLower === "country") {
            dimensions.push("country");
            columnMappings[col.column_name] = "country";
        } else if (nameLower === "hotel id" || nameLower === "hotel_id") {
            dimensions.push("hotel_id");
            columnMappings[col.column_name] = "hotel_id";
        }
    });

    // 3. Assemble Business Definitions based on found dimensions
    const businessDefinitions: BusinessDefinition[] = [];
    dimensions.forEach(dim => {
        const knowledgeConcept = (BUSINESS_KNOWLEDGE.concepts as any)[dim];
        if (knowledgeConcept) {
            businessDefinitions.push({
                name: dim,
                definition: knowledgeConcept.description
            });
        } else {
            // General definition fallback
            businessDefinitions.push({
                name: dim,
                definition: `${dim.charAt(0).toUpperCase() + dim.slice(1)} dimension of the dataset.`
            });
        }
    });

    // 4. Map Applicable Metrics
    const metrics: MetricDefinition[] = [];
    let applicableMetricKeys: string[] = [];

    if (datasetType === DatasetType.COMPETITIVENESS) {
        applicableMetricKeys = ["win_rate", "avg_price_diff", "median_price_diff"];
    } else if (datasetType === DatasetType.CONVERSION) {
        applicableMetricKeys = [
            "searches",
            "bookings",
            "vouchered_bookings",
            "cancelled_bookings",
            "total_sales",
            "vouchered_sales",
            "cancel_sales",
            "l2b",
            "l2v"
        ];
    }

    applicableMetricKeys.forEach(key => {
        const metric = METRIC_REGISTRY[key];
        if (metric) {
            metrics.push({
                name: metric.name,
                description: metric.description,
                formula: metric.formula
            });
        }
    });

    return {
        datasetType,
        dimensions,
        primaryTimeDimension,
        columnMappings,
        businessDefinitions,
        metrics,
        allColumns: schema
    };
}
