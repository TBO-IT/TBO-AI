import { ChatOrchestrator } from "../services/chatOrchestrator.js";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function runTests() {
    console.log("=== V4 ACTIONABILITY REVISION TESTS ===\n");
    try {
        // 1. Get the first dataset available
        const dataset = await prisma.dataset.findFirst();
        if (!dataset) {
            console.error("No dataset found in database.");
            return;
        }
        const datasetId = dataset.id;
        console.log(`Using Dataset: ${dataset.filename} (${datasetId})\n`);
        const tests = [
            "What is my worst performing APW bucket and what should I do?",
            "How do we beat Expedia?"
        ];
        for (let i = 0; i < tests.length; i++) {
            const question = tests[i];
            console.log(`\n==================================================`);
            console.log(`TEST ${i + 1}: ${question}`);
            console.log(`==================================================\n`);
            // ChatOrchestrator requires datasetId, userId, question
            const result = await ChatOrchestrator.execute(datasetId, dataset.userId, question);
            console.log("\n[TEST RESULT] Route Type:", result.routeType);
            console.log("\n[TEST RESULT] SQL:\n", result.sql);
            if (result.rootCausePack) {
                console.log("\n[TEST RESULT] Primary Target:");
                console.log(result.rootCausePack.primaryTarget);
                console.log("\n[TEST RESULT] Drilldowns:");
                console.log(result.rootCausePack.drilldowns);
                console.log("\n[TEST RESULT] Recommendations:");
                console.log(result.rootCausePack.recommendations);
            }
            console.log("\n[TEST RESULT] Final Answer Preview:");
            console.log(result.answer.substring(0, 500) + "...\n");
        }
    }
    catch (err) {
        console.error("Test failed:", err);
    }
    finally {
        await prisma.$disconnect();
    }
}
runTests();
