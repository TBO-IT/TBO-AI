import { RootCausePack, MetricChange } from "../RootCausePackBuilder.js";
import { PrioritizedInsight } from "./insightPrioritizer.js";
import { ExecutiveRisk } from "./riskEngine.js";
import { ExecutiveOpportunity } from "./opportunityEngine.js";
import { ExecutiveAction, generateActions } from "./actionEngine.js";
import { StrategicImplication, generateStrategicImplications } from "./strategicImplicationEngine.js";
import { generateKeyTakeaway } from "./keyTakeawayGenerator.js";
import { Scenario, generateScenarios } from "./scenarioEngine.js";
import { ActionImpact, generateActionImpacts } from "./actionImpactEngine.js";
import { Tradeoff, detectTradeoffs } from "./tradeoffEngine.js";
import { DependencyInsight, detectDependencies } from "./dependencyEngine.js";
import { ConfidenceAssessment, assessConfidence } from "./confidenceEngine.js";
import { ActionabilityTarget } from "./actionabilityEngine.js";
import { DrilldownInsight } from "./entityDrilldownEngine.js";
import { RecommendationTarget } from "./recommendationAttributionEngine.js";
import { CompetitiveGap } from "../analytics/competitorStrategyEngine.js";

export interface ExecutivePack {
    headline: string;
    executiveSummary: string;
    keyTakeaway: string;
    topDrivers: PrioritizedInsight[];
    topRisks: ExecutiveRisk[];
    topOpportunities: ExecutiveOpportunity[];
    recommendedFocusAreas: string[];
    topActions: ExecutiveAction[];
    strategicImplications: StrategicImplication[];
    scenarios: Scenario[];
    actionImpacts: ActionImpact[];
    tradeoffs: Tradeoff[];
    dependencies: DependencyInsight[];
    confidenceAssessment: ConfidenceAssessment;
    leadershipMessage: string;

    actionabilityTargets: ActionabilityTarget[];
    primaryTarget?: ActionabilityTarget;
    drilldowns: DrilldownInsight[];
    recommendations: RecommendationTarget[];
    competitiveGaps?: CompetitiveGap[];
    competitorContext?: {
        competitorName: string;
        rowCount: number;
        volume?: number;
    };
}

function generateHeadline(metricName: string, metricChange: MetricChange | null): string {
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
    } else {
        return `${metricName} declined by ${absChange.toFixed(1)} points.`;
    }
}

function generateExecutiveSummary(
    topDriver: PrioritizedInsight | undefined,
    topRisk: ExecutiveRisk | undefined
): string {
    let summary = "";

    if (topDriver) {
        if (topDriver.direction === "POSITIVE") {
            summary += `${topDriver.name} was the largest contributor to performance improvement. `;
        } else {
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

function generateFocusAreas(
    topRisks: ExecutiveRisk[],
    topOpportunities: ExecutiveOpportunity[]
): string[] {
    const focusAreas = new Set<string>();

    for (const risk of topRisks.slice(0, 2)) {
        if (risk.category === "CONCENTRATION") {
            focusAreas.add(`Diversify exposure away from ${risk.affectedEntity}`);
        } else {
            focusAreas.add(`Mitigate ${risk.affectedEntity} deterioration`);
        }
    }

    for (const opp of topOpportunities.slice(0, 2)) {
        if (opp.category === "EXPANSION") {
            focusAreas.add(`Expand ${opp.affectedEntity} investment`);
        } else {
            focusAreas.add(`Scale ${opp.affectedEntity} success`);
        }
    }

    return Array.from(focusAreas).slice(0, 5);
}

function generateLeadershipMessage(
    topRisk: ExecutiveRisk | undefined,
    topOpportunity: ExecutiveOpportunity | undefined
): string {
    if (topRisk && topOpportunity) {
        return `Leadership should prioritize mitigating ${topRisk.affectedEntity} deterioration while scaling successful ${topOpportunity.affectedEntity} strategies.`;
    } else if (topRisk) {
        return `Leadership should urgently prioritize mitigating ${topRisk.affectedEntity} deterioration to stabilize performance.`;
    } else if (topOpportunity) {
        return `Leadership should focus on scaling successful ${topOpportunity.affectedEntity} strategies to accelerate growth.`;
    } else {
        return `Leadership should maintain current strategies while closely monitoring segment volatility.`;
    }
}

export function buildExecutivePack(
    pack: RootCausePack,
    competitorContext?: { competitorName: string; sourceColumn: string }
): ExecutivePack {
    const topDrivers = pack.priorityDrivers.slice(0, 5);
    const topRisks = pack.risks.slice(0, 5);
    const topOpportunities = pack.opportunities.slice(0, 5);

    const headline = generateHeadline(pack.metricName, pack.metricChange);
    
    const topDriver = pack.priorityDrivers[0];
    const topRisk = pack.risks[0];
    const topOpportunity = pack.opportunities[0];

    const executiveSummary = generateExecutiveSummary(topDriver, topRisk);
    const keyTakeaway = generateKeyTakeaway(pack.metricName, pack.metricChange, topDriver, topRisk, topOpportunity);
    const recommendedFocusAreas = generateFocusAreas(pack.risks, pack.opportunities);
    const topActions = generateActions(pack.risks, pack.opportunities);
    const strategicImplications = generateStrategicImplications(pack.metricChange, pack.priorityDrivers, pack.risks, pack.opportunities);
    const leadershipMessage = generateLeadershipMessage(topRisk, topOpportunity);

    const scenarios = generateScenarios(pack.metricName, pack.metricChange, pack.risks, pack.opportunities);
    const actionImpacts = generateActionImpacts(topActions, pack.risks, pack.opportunities);
    const tradeoffs = detectTradeoffs(pack.priorityDrivers, pack.risks, pack.opportunities);
    const dependencies = detectDependencies(pack.priorityDrivers);
    const confidenceAssessment = assessConfidence(pack.priorityDrivers, pack.totalRows);

    const result: ExecutivePack = {
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
        primaryTarget: pack.primaryTarget,
        drilldowns: pack.drilldowns || [],
        recommendations: pack.recommendations || []
    };

    if (competitorContext) {
        result.competitorContext = {
            competitorName: competitorContext.competitorName,
            rowCount: pack.totalRows
        };
        console.log(
            `[COMPETITOR_EXEC_PACK]\n` +
            `competitor=${competitorContext.competitorName}\n` +
            `rows=${pack.totalRows}`
        );
    }

    return result;
}
