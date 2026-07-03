import { objectiveRegistry, objectiveSelector } from "../ai/objectives/bootstrap.js";
import { QuestionAnalysis } from "../ai/questionTypes.js";

function divider(title: string) {
    console.log("\n" + "=".repeat(60));
    console.log(title);
    console.log("=".repeat(60));
}

async function run() {
    divider("OBJECTIVE REGISTRY TEST");

    console.log(
        "Registered Objectives:",
        objectiveRegistry.getAll().length
    );

    const growth = objectiveRegistry.get("growth-diagnosis");
    console.log("\nGrowth Diagnosis Objective:");
    console.dir(growth, { depth: null });

    divider("OBJECTIVE SELECTOR TEST");

    const mockQuestions: QuestionAnalysis[] = [
        {
            intent: "TREND",
            metrics: [], dimensions: [], filters: [], timeReferences: [], originalQuestion: "Why is our trend going down?"
        },
        {
            intent: "COMPARISON",
            metrics: [], dimensions: [], filters: [], timeReferences: [], originalQuestion: "Compare us to competitors."
        },
        {
            intent: "ANOMALY",
            metrics: [], dimensions: [], filters: [], timeReferences: [], originalQuestion: "What happened yesterday?"
        },
        {
            intent: "SUMMARY",
            metrics: [], dimensions: [], filters: [], timeReferences: [], originalQuestion: "How are we doing?"
        }
    ];

    for (const q of mockQuestions) {
        console.log(`\nQuestion Intent: ${q.intent}`);
        const selected = objectiveSelector.select(q);
        console.log(`Selected Objective: ${selected.name}`);
        console.log(`Resolution Plan: ${selected.resolutionPlan.map(r => r.capability).join(" -> ")}`);
    }

    divider("DONE");
}

run().catch(console.error);
