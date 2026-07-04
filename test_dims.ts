import { getDatasetSchema } from "./src/services/schemaService";
import { buildSemanticLayer } from "./src/ai/semanticLayer";

async function run() {
    const csvPath = "/Users/aaryandidwania/Desktop/TBO/june_data_all_destinations.csv";
    const schema = await getDatasetSchema(csvPath);
    const semanticLayer = buildSemanticLayer(schema);
    console.log("Semantic Layer Dimensions:", semanticLayer.dimensions);
    console.log("Column Mappings:", semanticLayer.columnMappings);
}

run().catch(console.error);
