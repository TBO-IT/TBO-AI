import { ExecutiveRisk } from "./riskEngine.js";
import { ExecutiveOpportunity } from "./opportunityEngine.js";

export interface ExecutiveAction {
    priority: "HIGH" | "MEDIUM" | "LOW";
    action: string;
    rationale: string;
    relatedEntity: string;
}

export function generateActions(
    risks: ExecutiveRisk[],
    opportunities: ExecutiveOpportunity[]
): ExecutiveAction[] {
    const actions: ExecutiveAction[] = [];

    for (const risk of risks) {
        let actionStr = "";
        
        switch (risk.category) {
            case "SUPPLIER":
                actionStr = `Audit ${risk.affectedEntity} pricing competitiveness and contract terms`;
                break;
            case "HOTEL":
                actionStr = `Review ${risk.affectedEntity} performance and deploy recovery tactics`;
                break;
            case "CHAIN":
                actionStr = `Engage ${risk.affectedEntity} chain leadership to address deterioration`;
                break;
            case "CONCENTRATION":
                actionStr = `Diversify volume away from ${risk.affectedEntity} to reduce dependency`;
                break;
            case "BOOKING_WINDOW":
                actionStr = `Adjust pricing and availability strategies for the ${risk.affectedEntity} window`;
                break;
            default:
                actionStr = `Investigate and mitigate ${risk.affectedEntity} deterioration`;
                break;
        }

        actions.push({
            priority: risk.severity,
            action: actionStr,
            rationale: risk.explanation,
            relatedEntity: risk.affectedEntity
        });
    }

    for (const opp of opportunities) {
        let actionStr = "";

        switch (opp.category) {
            case "SUPPLIER":
                actionStr = `Increase allocation to ${opp.affectedEntity} and replicate their supplier practices`;
                break;
            case "HOTEL":
                actionStr = `Benchmark ${opp.affectedEntity} success and scale tactics to underperforming hotels`;
                break;
            case "CHAIN":
                actionStr = `Identify ${opp.affectedEntity} chain practices contributing to stronger conversion`;
                break;
            case "EXPANSION":
                actionStr = `Expand investment into ${opp.affectedEntity} to capitalize on strong performance`;
                break;
            case "BOOKING_WINDOW":
                actionStr = `Replicate successful distribution tactics across the ${opp.affectedEntity} window`;
                break;
            default:
                actionStr = `Investigate drivers of ${opp.affectedEntity} outperformance and scale`;
                break;
        }

        actions.push({
            priority: opp.severity,
            action: actionStr,
            rationale: opp.explanation,
            relatedEntity: opp.affectedEntity
        });
    }

    // Sort by priority
    const priorityWeight: Record<"HIGH" | "MEDIUM" | "LOW", number> = {
        HIGH: 3,
        MEDIUM: 2,
        LOW: 1
    };

    return actions
        .sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority])
        .slice(0, 3);
}
