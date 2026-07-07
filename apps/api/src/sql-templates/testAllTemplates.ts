import { templates } from "./templates.js";
import { globalClassifier } from "./classifier.js";

// Register all templates
templates.forEach(t => globalClassifier.register(t));

const testCases = [
    // Category 1: Win/Loss
    { id: "t01_overall_win_rate", query: "what is our win rate" },
    { id: "t02_win_rate_destination", query: "how are we doing in paris" },
    { id: "t03_win_rate_breakdown_destinations", query: "break down win rate by destination" },
    { id: "t04_best_worst_destination", query: "where are we winning the most" },
    { id: "t05_win_rate_competitor", query: "win rate against agoda" },
    { id: "t06_win_rate_trend", query: "win rate trend" },
    { id: "t07_win_rate_chain", query: "win rate for marriott" },
    { id: "t08_count_wins", query: "how many hotels are we winning in paris" },

    // Category 2: Price gap
    { id: "t09_avg_price_diff", query: "average price difference in paris" },
    { id: "t10_price_diff_breakdown_destination", query: "price difference by destination" },
    { id: "t11_top_hotels_price_gap", query: "top 5 hotels where we are overpriced in dubai" },
    { id: "t12_price_comp_competitor", query: "how do our prices compare to expedia in london" },
    { id: "t13_median_price_diff", query: "what's the typical price gap in paris" },
    { id: "t14_price_diff_apw", query: "price gap by booking window in paris" },
    { id: "t15_specific_hotel_price", query: "what's the price for amari phuket" },

    // Category 3: Volume & Coverage
    { id: "t16_total_hotels_scraped", query: "hotel count in paris" },
    { id: "t17_coverage_destination", query: "how much coverage do we have per destination" },
    { id: "t18_coverage_competitor", query: "how many comparisons do we have against agoda" },
    { id: "t19_coverage_chain", query: "chain coverage breakdown" },
    { id: "t20_fuzzy_match_quality", query: "fuzzy score distribution" },

    // Category 4: Performance Breakdowns
    { id: "t21_performance_apw", query: "break down performance by apw" },
    { id: "t22_best_worst_apw", query: "which booking window do we perform best in" },

    // Date/Trend variations
    { id: "t24_trend_date_range", query: "how has win rate changed since 2026-05-01" },
    { id: "t25_snapshot_date", query: "as of 2026-05-01" },

    // Category 5: Top / Bottom N Rankings
    { id: "t26_top_n_destinations", query: "top 5 destinations by volume" },
    { id: "t27_top_n_hotels", query: "top 10 hotels by win rate" },
    { id: "t28_bottom_n_hotels", query: "worst 10 hotels by win rate" },

    // Category 6: Comparative (T29-T31)
    { id: "t29_compare_destinations", query: "compare bangkok and pattaya" },
    { id: "t30_compare_chains", query: "marriott vs hilton chain" },
    { id: "t31_compare_thirdparty", query: "agoda vs expedia thirdparty" },

    // Category 7: Entity Lookup & Filtering (T32-T33)
    { id: "t32_single_hotel_profile", query: "tell me about amari phuket" },
    { id: "t33_hotels_by_filter", query: "show me all winning hotels in dubai for marriott" },
    
    // Data/Freshness/Destinations
    { id: "t34_data_freshness", query: "when was this last updated" },
    { id: "t35_available_destinations", query: "what destinations do we track" },
    { id: "t36_date_range", query: "what date range does this cover" }
];

let allPassed = true;
const missingTemplates = new Set(templates.map(t => t.id));

console.log(`Starting routing test for ${testCases.length} templates...\n`);

for (const tc of testCases) {
    missingTemplates.delete(tc.id);
    const result = globalClassifier.classify(tc.query);
    
    if (!result.matched) {
        console.error(`❌ FAILED: Query "${tc.query}" did NOT match anything. Reason: ${result.reason}`);
        allPassed = false;
    } else if (result.template_id !== tc.id) {
        console.error(`❌ FAILED: Query "${tc.query}" matched WRONG template. Expected ${tc.id}, got ${result.template_id}`);
        allPassed = false;
    } else {
        console.log(`✅ PASSED: [${tc.id}] -> "${tc.query}"`);
    }
}

if (missingTemplates.size > 0) {
    console.error(`\n❌ ERROR: The following templates were NOT tested:`);
    missingTemplates.forEach(t => console.error(`  - ${t}`));
    allPassed = false;
}

if (allPassed) {
    console.log(`\n🎉 SUCCESS: All templates routed correctly!`);
} else {
    console.log(`\n⚠️ SOME TESTS FAILED. Please review the output above.`);
}
