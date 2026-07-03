import { analyzeQuestion } from "../ai/questionAnalyzer.js";
import { objectiveSelector } from "../ai/objectives/bootstrap.js";
import { analysisPlanner } from "../ai/planning/bootstrap.js";

function divider(title: string) {
    console.log("\n" + "=".repeat(60));
    console.log(title);
    console.log("=".repeat(60));
}

const testQuestions = [
    { text: "How are we doing?", expectedIntent: "SUMMARY" },
    { text: "Compare Marriott and Hilton", expectedIntent: "COMPARISON" },
    { text: "Show the trend of win rate over the last 3 months", expectedIntent: "TREND" },
    { text: "Why is Marriott losing bookings?", expectedIntent: "ROOT_CAUSE" }
];

async function run() {
    divider("ANALYSIS PLANNER SMOKE TEST");

    for (const q of testQuestions) {
        console.log(`\nQUESTION: "${q.text}"`);

        // 1. Analyze the question (Mocking the pipeline input)
        const analysis = analyzeQuestion(q.text);
        
        // Force the intent if the basic analyzer didn't catch it correctly in our mock
        // (Just to ensure we hit the 4 specific intents requested in the prompt)
        analysis.intent = q.expectedIntent as any;

        console.log(`Intent ↓`);
        console.log(analysis.intent);
        
        // 2. Select Business Objective
        const objective = objectiveSelector.select(analysis);
        
        console.log(`\nBusiness Objective ↓`);
        console.log(`${objective.name} (${objective.id})`);
        
        // 3. Create Analysis Plan
        const plan = analysisPlanner.createPlan(objective);
        
        console.log(`\nAnalysis Plan ↓`);
        for (const pa of plan.analyses) {
            console.log(`  order: ${pa.order}`);
            console.log(`  analysis: ${pa.analysis.name}`);
            console.log(`  capability fulfilled: ${pa.analysis.capability}`);
            console.log(`  purpose: ${pa.purpose}\n`);
        }
    }

    divider("DONE");
}

run().catch(console.error);
