import { templates } from "./templates.js";
import { Tier0StructuredResponse } from "./types.js";

const t14 = templates.find(t => t.id === "t14_price_diff_apw")!;

const mockRows = [
    { apw_bucket_new: "< 10 days", volume: 100, avg_diff: 2.3 },
    { apw_bucket_new: "15-30 days", volume: 50, avg_diff: -1.2 }
];

const response = t14.formatAnswer(mockRows, { destination: "bangkok" }) as Tier0StructuredResponse;

console.log("CHART:", JSON.stringify(response.chart, null, 2));
