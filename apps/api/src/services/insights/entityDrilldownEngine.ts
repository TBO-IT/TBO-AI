import { QuestionAnalysis } from "../../ai/questionTypes.js";
import { EnrichedSemanticLayer } from "../../ai/semanticLayer.js";
import { generateContributionSql } from "../contributionEngine.js";
import { executeQuery } from "../queryExecutionService.js";
import { ActionabilityTarget } from "./actionabilityEngine.js";
// ContributorEntry is unused in this file; keeping import would require correct path resolution,
// so remove it to avoid TS module/type issues.

export interface DrilldownInsight {
    entityType: string;
    name: string;
    impactScore: number;
    reason: string;
}

// Map ActionabilityTarget entityType to the schema dimension names
const DIM_MAP: Record<string, string> = {
    "CHAIN": "chain",
    "HOTEL": "hotel",
    "DESTINATION": "destination",
    "SUPPLIER": "supplier",
    "APW": "apw"
};

export async function executeEntityDrilldown(
    primaryTarget: ActionabilityTarget | undefined,
    baseAnalysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer,
    csvPath: string,
    metricName: string = "performance metric",
    competitorContext?: { competitorName: string; sourceColumn: string }
): Promise<DrilldownInsight[]> {
    if (!primaryTarget || primaryTarget.entityType === "UNKNOWN") {
        return [];
    }

    const targetDimension = DIM_MAP[primaryTarget.entityType];
    if (!targetDimension) return [];

    console.log(`[DrilldownEngine] Drilling into ${targetDimension} = ${primaryTarget.name}`);

    // Create a clone of the analysis and append the filter for the primary target
    const drilldownAnalysis: QuestionAnalysis = {
        ...baseAnalysis,
        filters: [
            ...baseAnalysis.filters,
            { dimension: targetDimension, operator: "=", value: primaryTarget.name }
        ]
    };

    const drilldowns: DrilldownInsight[] = [];
    
    // We want to drill down into the other dimensions
    const drilldownDims = ["hotel", "chain", "supplier", "destination"]
        .filter(dim => dim !== targetDimension && semanticLayer?.dimensions?.some((d: string) => d.toLowerCase() === dim.toLowerCase()));

    for (const dim of drilldownDims) {
        const result = generateContributionSql(drilldownAnalysis, semanticLayer, dim);
        if (!result) continue;

        try {
            const rows = await executeQuery(result.sql, csvPath);
            if (rows.length === 0) continue;

            // We manually parse the top negative contributor from the rows.
            // generateContributionSql returns "Weighted Contribution" sorted DESC by absolute value.
            // We want the largest NEGATIVE contributor, or if the primary target is positive, the largest POSITIVE contributor.
            const isNegativeDrilldown = primaryTarget.impactScore < 0;

            let topRow = null;
            let maxImpact = 0;

            for (const row of rows) {
                const impact = Number(row["Weighted Contribution"]) || 0;
                if (isNegativeDrilldown && impact < maxImpact) {
                    maxImpact = impact;
                    topRow = row;
                } else if (!isNegativeDrilldown && impact > maxImpact) {
                    maxImpact = impact;
                    topRow = row;
                }
            }

            if (topRow) {
                // Determine the entity name column (first column usually, or labelled)
                const nameKey = Object.keys(topRow)[0];
                const name = String(topRow[nameKey] ?? "");
                const metricDelta = Number(topRow["Metric Delta"]) || 0;

                drilldowns.push({
                    entityType: dim.toUpperCase(),
                    name,
                    impactScore: maxImpact,
                    reason: metricDelta === 0 
                        ? `${metricName} remained stable for ${name} within ${primaryTarget.name}`
                        : isNegativeDrilldown 
                            ? `${name} reduced ${metricName} by ${Math.abs(metricDelta).toFixed(2)} percentage points, making it the largest negative driver within ${primaryTarget.name}`
                            : `${name} increased ${metricName} by ${metricDelta.toFixed(2)} percentage points, making it the largest positive driver within ${primaryTarget.name}`
                });
            }

        } catch (err: any) {
            console.error(`[DRILLDOWN_FAILURE] dimension=${dim} sql=${result.sql.slice(0, 100)}... error=${err.message || err}`);
        }
    }

    if (drilldownDims.length > 0 && drilldowns.length === 0) {
        console.error("[CRITICAL] ALL_DRILLDOWNS_FAILED");
    }

    return drilldowns;
}
