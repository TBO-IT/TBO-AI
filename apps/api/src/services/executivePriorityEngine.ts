import { QuestionAnalysis } from "../ai/questionTypes.js";
import { EnrichedSemanticLayer } from "../ai/semanticLayer.js";
import { generateContributionSql } from "./contributionEngine.js";
import { executeQuery } from "./queryExecutionService.js";
import { buildRootCausePack } from "./RootCausePackBuilder.js";
import { buildExecutivePack } from "./insights/executivePackBuilder.js";
import { executeEntityDrilldown } from "./insights/entityDrilldownEngine.js";
import { generateAttributedRecommendations } from "./insights/recommendationAttributionEngine.js";
import { CompetitorContext } from "./competitorDetector.js";

export interface ExecutivePriorityResult {
    sql: string;
    explanation: string;
    queryResultsList: Record<string, unknown>[][];
    rootCausePack: ReturnType<typeof buildRootCausePack>;
    executivePack: ReturnType<typeof buildExecutivePack>;
}

/**
 * Executive Priority pipeline — multi-dimensional contribution analysis
 * without RCA validation requirements. Used for leadership prioritization queries.
 */
export async function runExecutivePriorityPipeline(
    question: string,
    parsedQuestion: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer,
    csvPath: string,
    competitorContext?: CompetitorContext
): Promise<ExecutivePriorityResult> {
    let availableDims = ["hotel", "chain", "supplier", "destination", "apw"].filter(dim =>
        semanticLayer.dimensions.some(d => d.toLowerCase() === dim.toLowerCase())
    );

    // If the user explicitly asks for a particular dimension (like supplier), we should restrict our search.
    // However, if parsedQuestion.dimensions is empty, we fall back to all available dimensions.
    if (parsedQuestion.focus) {
        const focusDim = parsedQuestion.focus.toLowerCase();
        if (availableDims.includes(focusDim)) {
            availableDims = [focusDim];
        }
    } else if (parsedQuestion.dimensions && parsedQuestion.dimensions.length > 0) {
        // Find dimensions that are valid in the semantic layer and requested by the user
        const requestedDims = parsedQuestion.dimensions.map(d => d.toLowerCase());
        const filteredDims = availableDims.filter(dim => requestedDims.includes(dim));
        if (filteredDims.length > 0) {
            availableDims = filteredDims;
        }
    }

    const sqlStatements: string[] = [];
    const explanations: string[] = [];

    for (const dim of availableDims) {
        const result = generateContributionSql(parsedQuestion, semanticLayer, dim);
        if (result) {
            sqlStatements.push(result.sql);
            explanations.push(`- ${dim}: ${result.explanation}`);
        }
    }

    const sql = sqlStatements.join("\n---\n");
    const queryResultsList: Record<string, unknown>[][] = [];

    for (const statement of sqlStatements) {
        const rows = await executeQuery(statement, csvPath);
        queryResultsList.push(rows);
    }

    const rootCausePack = buildRootCausePack(question, semanticLayer, queryResultsList, competitorContext);
    const drilldowns = await executeEntityDrilldown(
        rootCausePack.primaryTarget,
        parsedQuestion,
        semanticLayer,
        csvPath,
        undefined,
        competitorContext
    );
    rootCausePack.drilldowns = drilldowns;
    rootCausePack.recommendations = generateAttributedRecommendations(
        rootCausePack.primaryTarget,
        drilldowns,
        competitorContext
    );

    const executivePack = buildExecutivePack(rootCausePack, competitorContext);

    console.log(
        `[EXECUTIVE_PRIORITY] primaryTarget=${executivePack.primaryTarget?.name ?? "none"} | ` +
        `drivers=${executivePack.topDrivers?.length ?? 0} | rows=${rootCausePack.totalRows}`
    );

    return {
        sql,
        explanation: "Executive Priority Analysis:\n" + explanations.join("\n"),
        queryResultsList,
        rootCausePack,
        executivePack
    };
}
