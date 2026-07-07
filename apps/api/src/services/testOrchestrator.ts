import { ChatOrchestrator } from "./chatOrchestrator.js";

async function main() {
    try {
        const result = await ChatOrchestrator.execute(
            "54e894cb-e0c8-45fa-98bc-9eab1e3b4d7b", // datasetId from earlier logs
            "test-user",
            "compare bangkok and pattaya"
        );
        console.log("ROUTE TYPE:", result.routeType);
        console.log("RESPONSE SOURCE:", result.responseSource);
        console.log("TIER_0 ANSWER:", result.answer);
    } catch (e) {
        console.error("Execution failed:", e);
    }
}

main();
