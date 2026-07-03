import { analyzeQuestion } from "../ai/questionAnalyzer.js";
import { objectiveSelector } from "../ai/objectives/bootstrap.js";
import { analysisPlanner } from "../ai/planning/bootstrap.js";
import { EvidencePlanner } from "../ai/evidence/index.js";

const testQuestions = [
    { text: "How are we doing?", expectedIntent: "SUMMARY" },
    { text: "Compare Marriott and Hilton", expectedIntent: "COMPARISON" },
    { text: "Why is Marriott losing bookings?", expectedIntent: "ROOT_CAUSE" },
    { text: "Show the trend of win rate over the last 3 months", expectedIntent: "TREND" }
];

async function run() {
    for (const q of testQuestions) {
        console.log("\n========================================");
        console.log(`QUESTION: "${q.text}"`);

        const analysis = analyzeQuestion(q.text);
        analysis.intent = q.expectedIntent as any; // Mock missing intents

        const objective = objectiveSelector.select(analysis);
        
        const plan = analysisPlanner.createPlan(objective);

        const evidencePlan = new EvidencePlanner().createPlan(plan);

        console.log(`\nObjective: ${objective.name}`);
        console.log(`Analyses Planned: ${plan.analyses.length}`);
        console.log(`Unique Evidence Requirements: ${evidencePlan.requirements.length}`);
        
        console.log("\nEvidence Plan ↓");
        console.dir(evidencePlan, { depth: null });
    }
}

run().catch(console.error);