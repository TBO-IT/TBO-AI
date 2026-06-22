import { downloadDataset } from "./src/services/storageService.js";
import { executeQuery } from "./src/services/queryExecutionService.js";

async function test() {
    try {
        console.log("Downloading dataset...");
        // This is a dummy name, just to see if it creates the file or throws supabase error
        const localPath = await downloadDataset("66ca5394-370e-4509-a695-db2ff9e4e5ba-june_data.csv");
        console.log("Local path:", localPath);
        
        console.log("Executing query...");
        const res = await executeQuery("SELECT COUNT(*) as total FROM data_table", localPath);
        console.log("Result:", res);
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
