import { extractMetadata } from "./src/services/metadataService";
import { DatasetType } from "./src/ai/datasetTypes";

async function run() {
    const csvPath = "/Users/aaryandidwania/Desktop/TBO/june_data_all_destinations.csv";
    const meta = await extractMetadata(csvPath, DatasetType.COMPETITIVENESS);
    console.log("Third Parties:", meta.thirdParties);
}

run().catch(console.error);
