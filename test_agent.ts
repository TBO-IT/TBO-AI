import { runDataAnalystAgent } from "./apps/api/src/services/dataAnalystAgent";
import { EnrichedSemanticLayer } from "./apps/api/src/ai/semanticLayer";
import { DatasetType } from "./apps/api/src/ai/datasetTypes";

const semanticLayer: EnrichedSemanticLayer = {
    datasetType: DatasetType.COMPETITIVENESS,
    dimensions: ["destination"],
    metricKeys: ["win_rate"],
    columnMappings: {},
    allColumns: [
        { column_name: "destination", column_type: "VARCHAR" },
        { column_name: "win_rate", column_type: "DOUBLE" }
    ],
    schema: []
};

runDataAnalystAgent(
    "show me the performance of bangkok",
    { intent: "PERFORMANCE", metrics: [], dimensions: [], filters: [], originalQuestion: "show me the performance of bangkok" } as any,
    semanticLayer,
    {} as any,
    "/Users/aaryandidwania/Desktop/TBO/june_data_all_destinations.csv"
).then(console.log).catch(console.error);
