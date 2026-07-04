import { llmParseQuestion } from "./apps/api/src/ai/llmQuestionParser";
import { DatasetType } from "./apps/api/src/ai/datasetTypes";
import { EnrichedSemanticLayer } from "./apps/api/src/ai/semanticLayer";
import { config } from "dotenv";
config({ path: "./apps/api/.env" }); // Load API keys

const semanticLayer: EnrichedSemanticLayer = {
    datasetType: DatasetType.COMPETITIVENESS,
    dimensions: ["hotel", "chain", "supplier", "apw", "destination", "city", "country", "hotel_id", "competitor"],
    metricKeys: ["win_rate", "avg_price_diff", "volume"],
    columnMappings: {},
    allColumns: [],
    schema: []
};

async function run() {
    console.log("Question 1:");
    console.log(await llmParseQuestion("which is my best chain in dubai?", semanticLayer));
    console.log("\nQuestion 2:");
    console.log(await llmParseQuestion("show me the hotels in dubai with winning price gap between 1 and 3 %", semanticLayer));
}

run().catch(console.error);
