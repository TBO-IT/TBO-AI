import { MetricChange } from "../RootCausePackBuilder.js";
import { PrioritizedInsight } from "./insightPrioritizer.js";
import { ExecutiveRisk } from "./riskEngine.js";
import { ExecutiveOpportunity } from "./opportunityEngine.js";

export function generateKeyTakeaway(
    metricName: string,
    metricChange: MetricChange | null,
    topDriver: PrioritizedInsight | undefined,
    topRisk: ExecutiveRisk | undefined,
    topOpportunity: ExecutiveOpportunity | undefined
): string {
    
    if (!metricChange) {
        return `Performance requires continued monitoring to establish clear directional trends.`;
    }

    const isFlat = Math.abs(metricChange.absoluteChange) < 0.5;
    
    if (isFlat) {
        if (topRisk && topOpportunity) {
            return `${metricName} appears stable, but ${topOpportunity.affectedEntity} growth is currently offsetting ${topRisk.affectedEntity} weakness to prevent overall performance decline.`;
        }
        if (topRisk) {
            return `${metricName} appears stable, but underlying volatility and ${topRisk.affectedEntity} weakness suggests future deterioration risk unless addressed.`;
        }
        return `${metricName} performance remained stable with no material risks identified.`;
    }

    if (metricChange.direction === "increase") {
        if (topRisk) {
            return `While ${metricName} improved overall, ${topRisk.affectedEntity} deterioration remains a material downside risk that requires attention.`;
        }
        if (topDriver && topOpportunity) {
            return `Strong ${metricName} improvement was driven by ${topDriver.name}, presenting a clear opportunity to scale ${topOpportunity.affectedEntity} success.`;
        }
        return `${metricName} improved significantly, driven by broad-based positive performance.`;
    } else {
        // decline
        if (topOpportunity) {
            return `${metricName} declined due to underlying weakness, though ${topOpportunity.affectedEntity} presents a tangible opportunity to offset future losses.`;
        }
        if (topDriver && topRisk) {
            return `Significant ${metricName} decline was driven by ${topDriver.name}, highlighting ${topRisk.affectedEntity} as an urgent risk to stabilize.`;
        }
        return `${metricName} declined significantly across multiple segments requiring immediate stabilization efforts.`;
    }
}
