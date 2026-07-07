import { routeTier0Query } from "./router.js";
import { DatasetMetadata } from "../services/metadataService.js";
import * as queryExecutionService from "../services/queryExecutionService.js";
import sinon from "sinon";

const metadata: DatasetMetadata = {
    destinations: ["bangkok", "pattaya", "dubai", "london", "paris"],
    chains: ["marriott", "hilton"],
    thirdParties: ["agoda", "expedia"],
    hotels: ["amari phuket"]
};

// Mock the duckdb execution so it doesn't actually query a file
sinon.stub(queryExecutionService, "executeQuery").callsFake(async (sql, tempPath) => {
    console.log("EXECUTED SQL:", sql);
    // Return dummy rows to see if formatAnswer works
    return [
        { destination: "bangkok", volume: 100, win_rate: 65.5, avg_diff: 2.3 },
        { destination: "pattaya", volume: 50, win_rate: 45.0, avg_diff: -1.2 }
    ];
});

async function main() {
    console.log("Testing 'compare bangkok and pattaya'...");
    const result = await routeTier0Query("compare bangkok and pattaya", "mock-id", metadata, "mock-path");
    
    console.log("HANDLED:", result.handled);
    console.log("REASON:", result.reason);
    if (result.handled) {
        console.log("ANSWER:", result.response);
        console.log("CHART GENERATED:", !!result.chart);
        if (result.chart) {
            console.log("CHART DATA:", JSON.stringify(result.chart, null, 2));
        }
    }
}

main();
