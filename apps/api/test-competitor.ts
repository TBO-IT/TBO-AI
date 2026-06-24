import { getDatasets } from "./src/services/datasetService.js";
import { downloadDataset } from "./src/services/storageService.js";
import { executeQuery } from "./src/services/queryExecutionService.js";
import { ChatOrchestrator } from "./src/services/chatOrchestrator.js";

async function main() {
    const datasetId = "66ca5394-370e-4509-a695-db2ff9e4e5ba"; // Using a mock ID to bypass Prisma if needed, but chatOrchestrator needs a valid dataset.
    // Wait, since we can't use prisma, we must mock getDataset inside chatOrchestrator or just run the test via mocking.
    // Let's monkeypatch getDataset and downloadDataset!
    
    const mockDatasetId = "mock-dataset-id";
    const tempPath = "C:\\Users\\aaryan.didwania\\Desktop\\tbo\\TBO-project\\node_modules\\.pnpm\\node_modules\\api\\uploads\\testdata.csv";

    // Dynamic import to allow mocking
    const datasetService = await import("./src/services/datasetService.js");
    const storageService = await import("./src/services/storageService.js");
    
    // @ts-ignore
    datasetService.getDataset = async () => ({ id: mockDatasetId, storagePath: "mock/path" });
    // @ts-ignore
    storageService.downloadDataset = async () => tempPath;

    const competitors = ["Otilla", "TripJack", "Agoda"];

    for (const comp of competitors) {
        console.log(`\n======================================================`);
        console.log(`[TESTING] What should we do to beat ${comp}?`);
        console.log(`======================================================`);
        
        try {
            const result = await ChatOrchestrator.execute(mockDatasetId, `What should we do to beat ${comp}?`);
            
            console.log("\n[EXECUTIVE PACK OUTPUT]");
            console.log(`Competitor: ${comp}`);
            const pack = result.claudeInputPack;
            if (!pack) {
                console.log("No pack built.");
                continue;
            }
            console.log(`Primary Target: ${pack.primaryTarget?.name || 'N/A'}`);
            
            const drivers = pack.topDrivers.map((d: any) => d.name).join(", ");
            console.log(`Top Drivers: ${drivers}`);

            const drilldowns = pack.drilldowns.map((d: any) => `${d.entityType}:${d.name}`).join(", ");
            console.log(`Drilldowns: ${drilldowns}`);

            const recs = pack.recommendations.map((r: any) => r.targetName).join(", ");
            console.log(`Recommendations: ${recs}`);

        } catch (e: any) {
            console.error(`Error for ${comp}:`, e.message);
        }
    }
}

main().catch(console.error);
