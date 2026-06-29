import { generateActions } from "./actionEngine.js";
import { generateStrategicImplications } from "./strategicImplicationEngine.js";
import { generateKeyTakeaway } from "./keyTakeawayGenerator.js";
import { generateScenarios } from "./scenarioEngine.js";
import { generateActionImpacts } from "./actionImpactEngine.js";
import { detectTradeoffs } from "./tradeoffEngine.js";
import { detectDependencies } from "./dependencyEngine.js";
import { assessConfidence } from "./confidenceEngine.js";
import { TargetPolarity } from "./actionabilityEngine.js";
function generateHeadline(metricName, metricChange) {
    if (!metricChange) {
        return `Analysis of ${metricName} performance.`;
    }
    const absChange = Math.abs(metricChange.absoluteChange);
    const direction = metricChange.direction;
    if (absChange < 0.5 || direction === "flat") {
        return `${metricName} performance remained stable despite internal shifts.`;
    }
    if (direction === "increase") {
        return `${metricName} improved by ${absChange.toFixed(1)} points.`;
    }
    else {
        return `${metricName} declined by ${absChange.toFixed(1)} points.`;
    }
}
function generateExecutiveSummary(topDriver, topRisk) {
    let summary = "";
    if (topDriver) {
        if (topDriver.direction === "POSITIVE") {
            summary += `${topDriver.name} was the largest contributor to performance improvement. `;
        }
        else {
            summary += `${topDriver.name} was the largest drag on performance. `;
        }
    }
    if (topRisk) {
        summary += `${topRisk.affectedEntity} deterioration remains the largest downside risk.`;
    }
    if (!summary) {
        return "Performance drivers are widely distributed with no single concentrated risk.";
    }
    return summary.trim();
}
function generateFocusAreas(topRisks, topOpportunities) {
    const focusAreas = new Set();
    for (const risk of topRisks.slice(0, 2)) {
        if (risk.category === "CONCENTRATION") {
            focusAreas.add(`Diversify exposure away from ${risk.affectedEntity}`);
        }
        else {
            focusAreas.add(`Mitigate ${risk.affectedEntity} deterioration`);
        }
    }
    for (const opp of topOpportunities.slice(0, 2)) {
        if (opp.category === "EXPANSION") {
            focusAreas.add(`Expand ${opp.affectedEntity} investment`);
        }
        else {
            focusAreas.add(`Scale ${opp.affectedEntity} success`);
        }
    }
    return Array.from(focusAreas).slice(0, 5);
}
function generateLeadershipMessage(primaryTarget, topRisk, topOpportunity) {
    if (primaryTarget) {
        switch (primaryTarget.polarity) {
            case TargetPolarity.RISK:
                return `Leadership should allocate resources to de-risk ${primaryTarget.name} because ${primaryTarget.selectionRationale}`;
            case TargetPolarity.NEGATIVE:
                return `Leadership should allocate resources to fix ${primaryTarget.name} because ${primaryTarget.selectionRationale}`;
            case TargetPolarity.POSITIVE:
            default:
                return `Leadership should allocate resources to scale ${primaryTarget.name} because ${primaryTarget.selectionRationale}`;
        }
    }
    if (topRisk && topOpportunity) {
        return `Leadership should prioritize mitigating ${topRisk.affectedEntity} deterioration while scaling successful ${topOpportunity.affectedEntity} strategies.`;
    }
    else if (topRisk) {
        return `Leadership should urgently prioritize mitigating ${topRisk.affectedEntity} deterioration to stabilize performance.`;
    }
    else if (topOpportunity) {
        return `Leadership should focus on scaling successful ${topOpportunity.affectedEntity} strategies to accelerate growth.`;
    }
    else {
        return `Leadership should maintain current strategies while closely monitoring segment volatility.`;
    }
}
export function buildExecutivePack(pack, competitorContext) {
    const topDrivers = pack.priorityDrivers.slice(0, 5);
    const topRisks = pack.risks.slice(0, 5);
    const topOpportunities = pack.opportunities.slice(0, 5);
    const headline = generateHeadline(pack.metricName, pack.metricChange);
    const topDriver = pack.priorityDrivers[0];
    const topRisk = pack.risks[0];
    const topOpportunity = pack.opportunities[0];
    const primaryTarget = pack.primaryTarget;
    const executiveSummary = generateExecutiveSummary(topDriver, topRisk);
    const keyTakeaway = generateKeyTakeaway(pack.metricName, pack.metricChange, topDriver, topRisk, topOpportunity);
    const recommendedFocusAreas = generateFocusAreas(pack.risks, pack.opportunities);
    const topActions = generateActions(pack.risks, pack.opportunities);
    const strategicImplications = generateStrategicImplications(pack.metricChange, pack.priorityDrivers, pack.risks, pack.opportunities);
    const leadershipMessage = generateLeadershipMessage(primaryTarget, topRisk, topOpportunity);
    const decisionBrief = primaryTarget
        ? {
            targetPolarity: primaryTarget.polarity,
            selectedTarget: primaryTarget.name,
            selectionRationale: primaryTarget.selectionRationale,
            whySelected: primaryTarget.selectionRationale,
            alternatives: (pack.actionabilityTargets || []).slice(1, 4).map(target => ({
                name: target.name,
                polarity: target.polarity,
                resourceAllocationScore: target.resourceAllocationScore,
                reason: target.selectionRationale
            }))
        }
        : undefined;
    const scenarios = generateScenarios(pack.metricName, pack.metricChange, pack.risks, pack.opportunities);
    const actionImpacts = generateActionImpacts(topActions, pack.risks, pack.opportunities);
    const tradeoffs = detectTradeoffs(pack.priorityDrivers, pack.risks, pack.opportunities);
    const dependencies = detectDependencies(pack.priorityDrivers);
    const confidenceAssessment = assessConfidence(pack.priorityDrivers, pack.totalRows);
    const result = {
        headline,
        executiveSummary,
        keyTakeaway,
        topDrivers,
        topRisks,
        topOpportunities,
        recommendedFocusAreas,
        topActions,
        strategicImplications,
        scenarios,
        actionImpacts,
        tradeoffs,
        dependencies,
        confidenceAssessment,
        leadershipMessage,
        actionabilityTargets: pack.actionabilityTargets || [],
        primaryTarget,
        decisionBrief,
        drilldowns: pack.drilldowns || [],
        recommendations: pack.recommendations || []
    };
    if (competitorContext) {
        result.competitorContext = {
            competitorName: competitorContext.competitorName,
            rowCount: pack.totalRows
        };
        console.log(`[COMPETITOR_EXEC_PACK]\n` +
            `competitor=${competitorContext.competitorName}\n` +
            `rows=${pack.totalRows}`);
    }
    return result;
}
