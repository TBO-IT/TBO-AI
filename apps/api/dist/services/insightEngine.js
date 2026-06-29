/**
 * Automatically extracts insights from raw data arrays before narrative generation.
 * This relieves the LLM from having to "do the math" and just lets it write the narrative.
 */
export function extractInsights(rows) {
    if (!rows || rows.length === 0)
        return ["No data available for insights."];
    const insights = [];
    const rowCount = rows.length;
    // We only extract insights if we have multiple rows to compare
    if (rowCount > 1) {
        const columns = Object.keys(rows[0]);
        for (const col of columns) {
            // Find the top performer and worst performer for numeric columns
            if (typeof rows[0][col] === "number") {
                let maxVal = -Infinity;
                let minVal = Infinity;
                let maxRow = null;
                let minRow = null;
                for (const row of rows) {
                    const val = row[col];
                    if (typeof val === "number") {
                        if (val > maxVal) {
                            maxVal = val;
                            maxRow = row;
                        }
                        if (val < minVal) {
                            minVal = val;
                            minRow = row;
                        }
                    }
                }
                // Try to find a dimension column to label the insight (usually the first non-numeric column)
                const dimensionCol = columns.find(c => typeof rows[0][c] === "string");
                if (dimensionCol && maxRow && minRow && maxVal !== minVal) {
                    const maxLabel = maxRow[dimensionCol];
                    const minLabel = minRow[dimensionCol];
                    insights.push(`Top performer by ${col}: ${maxLabel} (${maxVal})`);
                    insights.push(`Lowest performer by ${col}: ${minLabel} (${minVal})`);
                    // Simple anomaly check (if max is > 3x the average of min and max)
                    // Note: In a real system, you'd calculate true stddev.
                    if (minVal > 0 && maxVal > minVal * 3) {
                        insights.push(`Anomaly detected: ${maxLabel} is significantly outperforming the bottom range in ${col}.`);
                    }
                }
            }
        }
    }
    return insights;
}
