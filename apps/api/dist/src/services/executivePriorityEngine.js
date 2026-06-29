import { generateContributionSql } from "./contributionEngine.js";
import { executeQuery } from "./queryExecutionService.js";
import { buildRootCausePack } from "./RootCausePackBuilder.js";
import { buildExecutivePack } from "./insights/executivePackBuilder.js";
import { executeEntityDrilldown } from "./insights/entityDrilldownEngine.js";
import { generateAttributedRecommendations } from "./insights/recommendationAttributionEngine.js";
/**
 * Executive Priority pipeline — multi-dimensional contribution analysis
 * without RCA validation requirements. Used for leadership prioritization queries.
 */
export async function runExecutivePriorityPipeline(question, parsedQuestion, semanticLayer, csvPath, competitorContext) {
    const availableDims = ["hotel", "chain", "supplier", "destination", "apw"].filter(dim => semanticLayer.dimensions.some(d => d.toLowerCase() === dim.toLowerCase()));
    const sqlStatements = [];
    const explanations = [];
    for (const dim of availableDims) {
        const result = generateContributionSql(parsedQuestion, semanticLayer, dim);
        if (result) {
            sqlStatements.push(result.sql);
            explanations.push(`- ${dim}: ${result.explanation}`);
        }
    }
    const sql = sqlStatements.join("\n---\n");
    const queryResultsList = [];
    for (const statement of sqlStatements) {
        const rows = await executeQuery(statement, csvPath);
        queryResultsList.push(rows);
    }
    const rootCausePack = buildRootCausePack(question, semanticLayer, queryResultsList, competitorContext);
    const drilldowns = await executeEntityDrilldown(rootCausePack.primaryTarget, parsedQuestion, semanticLayer, csvPath, competitorContext);
    rootCausePack.drilldowns = drilldowns;
    rootCausePack.recommendations = generateAttributedRecommendations(rootCausePack.primaryTarget, drilldowns, competitorContext);
    const executivePack = buildExecutivePack(rootCausePack, competitorContext);
    console.log(`[EXECUTIVE_PRIORITY] primaryTarget=${executivePack.primaryTarget?.name ?? "none"} | ` +
        `drivers=${executivePack.topDrivers?.length ?? 0} | rows=${rootCausePack.totalRows}`);
    return {
        sql,
        explanation: "Executive Priority Analysis:\n" + explanations.join("\n"),
        queryResultsList,
        rootCausePack,
        executivePack
    };
}
