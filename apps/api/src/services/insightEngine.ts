/**
 * Automatically extracts insights from raw data arrays before narrative generation.
 * This relieves the LLM from having to "do the math" and just lets it write the narrative.
 */
export function extractInsights(rows: any[]): string[] {
    if (!rows || rows.length === 0) return ["No data available for insights."];

    const insights: string[] = [];
    const rowCount = rows.length;

    // We only extract insights if we have multiple rows to compare
    if (rowCount > 1) {
        const columns = Object.keys(rows[0]);
        const dimensionCol = columns.find(c => typeof rows[0][c] === "string");

        for (const col of columns) {
            if (typeof rows[0][col] === "number") {
                const values = rows.map(r => Number(r[col])).filter(v => isFinite(v));
                if (values.length === 0) continue;

                const sum = values.reduce((a, b) => a + b, 0);
                const mean = sum / values.length;
                const sorted = [...values].sort((a, b) => a - b);
                const minVal = sorted[0];
                const maxVal = sorted[sorted.length - 1];
                const median = sorted.length % 2 === 0
                    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
                    : sorted[Math.floor(sorted.length / 2)];
                const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
                const stddev = Math.sqrt(variance);

                const minRow = rows.find(r => r[col] === minVal);
                const maxRow = rows.find(r => r[col] === maxVal);

                if (dimensionCol && maxRow && minRow && maxVal !== minVal) {
                    const maxLabel = maxRow[dimensionCol];
                    const minLabel = minRow[dimensionCol];
                    
                    insights.push(`Top performer by ${col}: ${maxLabel} (${maxVal.toFixed(2)})`);
                    insights.push(`Lowest performer by ${col}: ${minLabel} (${minVal.toFixed(2)})`);
                    
                    // Concentration ratio (top 3 share)
                    if (sum > 0 && values.length >= 5) {
                        const top3Sum = sorted.slice(-3).reduce((a, b) => a + b, 0);
                        const concentration = (top3Sum / sum) * 100;
                        if (concentration > 50) {
                            insights.push(`High concentration: The top 3 performers account for ${concentration.toFixed(1)}% of total ${col}.`);
                        }
                    }

                    // Spread and Outliers
                    const cv = mean !== 0 ? stddev / mean : 0;
                    if (Math.abs(cv) > 0.5) {
                        insights.push(`High variance in ${col} across segments (CV: ${cv.toFixed(2)}).`);
                    }

                    if (maxVal > mean + 2 * stddev) {
                         insights.push(`Positive outlier detected: ${maxLabel} is significantly above average in ${col}.`);
                    }
                    if (minVal < mean - 2 * stddev) {
                         insights.push(`Negative outlier detected: ${minLabel} is significantly below average in ${col}.`);
                    }
                }
            }
        }
    }

    return insights;
}
