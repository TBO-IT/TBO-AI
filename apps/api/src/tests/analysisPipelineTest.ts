import { analyzeQuestion } from "../ai/questionAnalyzer.js";
import { analysisPipeline } from "../ai/pipeline/index.js";

const questions = [

    "How is Marriott performing in London?",

    "Compare Marriott and Hilton",

    "Why is Marriott losing bookings?",

    "Show the trend of win rate"

];

for (const q of questions) {

    console.log("\n======================================");
    console.log(q);

    const parsed =
        analyzeQuestion(q);

    const result =
        analysisPipeline.execute(parsed);

    console.dir(result, {
        depth: null
    });

}