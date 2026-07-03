import { analyzeQuestion } from "../ai/questionAnalyzer.js";
import { analysisSelector } from "../ai/analysis/index.js";

const questions = [
    "How is Marriott performing in London?",
    "Compare Marriott and Hilton",
    "Why is Marriott losing bookings?",
    "Show the trend of win rate over the last 3 months",
    "Which supplier contributes the most revenue?"
];

for (const question of questions) {

    console.log("\n========================================");
    console.log("QUESTION:");
    console.log(question);

    const analysis = analyzeQuestion(question);

    console.log("\nQuestion Analysis:");
    console.dir(analysis, { depth: null });

    const selected = analysisSelector.select(analysis);

    console.log("\nSelected Analysis:");
    console.dir(selected, { depth: null });
}