import { globalClassifier } from "../sql-templates/classifier.js";
import { templates } from "../sql-templates/templates.js";

// Register templates
templates.forEach(t => globalClassifier.register(t));

const questions = [
    "what is our win rate by destination and chain",
    "break down price diff by destination and booking window",
    "which hotels have a price gap over 10%",
    "how is Dubai doing overall",
    "give me a summary of Phuket",
    "what is win rate",
    "what about Marriott",
    "win rate in Dubai"
];

for (const q of questions) {
    const res = globalClassifier.classify(q);
    console.log(`\nQuery: "${q}"`);
    console.log(`Matched: ${res.matched}`);
    if (res.matched) {
        console.log(`Template: ${res.template_id}`);
        console.log(`Slots:`, res.slots);
    } else {
        console.log(`Reason: ${res.reason}`);
    }
}
