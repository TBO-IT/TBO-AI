import { globalClassifier } from "./classifier.js";
import { templates } from "./templates.js";

// Register
templates.forEach(t => globalClassifier.register(t));

const testQueries = [
    "tell me about Amari Phuket",
    "what's our win rate",
    "what is our win rate",
    "how are we doing in Paris",
    "are we winning more than losing",
    "compare Dubai and London",
    "compare bangkok and pattaya",
    "Dubai vs London destination",
    "are we beating Agoda",
    "win rate against Expedia",
    "break down performance by apw",
    "hotel count in paris",
    "top 5 destinations by volume",
    "worst 10 hotels by win_rate"
];

for (const q of testQueries) {
    const res = globalClassifier.classify(q);
    console.log(`Query: "${q}"\n  -> Matched: ${res.matched}`);
    if (res.matched) {
        console.log(`  -> Template: ${res.template_id}`);
        console.log(`  -> Slots:`, res.slots);
    } else {
        console.log(`  -> Reason: ${res.reason}`);
    }
    console.log("--------------------------------------------------");
}
