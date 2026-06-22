import { MetricChange } from "../RootCausePackBuilder.js";
import { PrioritizedInsight } from "./insightPrioritizer.js";


export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH";

export type RiskCategory =
    | "SUPPLIER"
    | "HOTEL"
    | "CHAIN"
    | "BOOKING_WINDOW"
    | "PERFORMANCE"
    | "CONCENTRATION";

export interface ExecutiveRisk {
    title: string;
    severity: RiskSeverity;
    category: RiskCategory;

    affectedEntity: string;

    explanation: string;

    impactScore: number;
}

function inferCategory(entityName: string): RiskCategory {
    const lower = entityName.toLowerCase();

    if (
        lower.includes("day") ||
        lower.includes("days") ||
        lower.includes("apw")
    ) {
        return "BOOKING_WINDOW";
    }

    return "PERFORMANCE";
}

function buildNegativeDriverRisk(
    driver: PrioritizedInsight
): ExecutiveRisk {

    const severity: RiskSeverity =
        driver.volumeSharePct >= 15 ||
            Math.abs(driver.metricDelta) >= 5
            ? "HIGH"
            : driver.volumeSharePct >= 8
                ? "MEDIUM"
                : "LOW";

    return {
        title: `${driver.name} deterioration`,
        severity,

        category: inferCategory(driver.name),

        affectedEntity: driver.name,

        impactScore: Number(
            driver.impactScore.toFixed(2)
        ),

        explanation:
            `${driver.name} declined by ` +
            `${driver.metricDelta.toFixed(2)} points ` +
            `while representing ${driver.volumeSharePct.toFixed(1)}% ` +
            `of total volume.`
    };
}

function buildConcentrationRisk(
    driver: PrioritizedInsight
): ExecutiveRisk {

    return {
        title: `${driver.name} concentration risk`,

        severity: "HIGH",

        category: "CONCENTRATION",

        affectedEntity: driver.name,

        impactScore: Number(
            driver.impactScore.toFixed(2)
        ),

        explanation:
            `${driver.name} represents ` +
            `${driver.volumeSharePct.toFixed(1)}% of total volume. ` +
            `Performance deterioration in a highly concentrated segment ` +
            `could materially impact overall results.`
    };
}

function buildVolatilityRisk(): ExecutiveRisk {

    return {
        title: "Performance volatility hidden by stable headline metric",

        severity: "HIGH",

        category: "PERFORMANCE",

        affectedEntity: "Overall Performance",

        impactScore: 1000,

        explanation:
            "Overall performance appears stable, but significant positive " +
            "and negative movements are offsetting each other. " +
            "The headline metric may be masking underlying instability."
    };
}

export function detectRisks(
    priorityDrivers: PrioritizedInsight[],
    metricChange: MetricChange | null
): ExecutiveRisk[] {

    const risks: ExecutiveRisk[] = [];

    // ---------------------------------------------------------
    // RULE 1:
    // High-impact negative contributors
    // ---------------------------------------------------------

    for (const driver of priorityDrivers) {

        if (driver.direction !== "NEGATIVE") {
            continue;
        }

        const meaningfulDecline =
            driver.volumeSharePct >= 8 ||
            Math.abs(driver.metricDelta) >= 3;

        if (meaningfulDecline) {
            risks.push(
                buildNegativeDriverRisk(driver)
            );
        }
    }

    // ---------------------------------------------------------
    // RULE 2:
    // Concentration risk
    // ---------------------------------------------------------

    for (const driver of priorityDrivers) {

        if (driver.volumeSharePct >= 25) {

            risks.push(
                buildConcentrationRisk(driver)
            );
        }
    }

    // ---------------------------------------------------------
    // RULE 3:
    // Flat metric but volatile internals
    // ---------------------------------------------------------

    const metricLooksFlat =
        metricChange &&
        Math.abs(metricChange.absoluteChange) < 0.5;

    const hasLargeMovements =
        priorityDrivers.some(
            d => Math.abs(d.metricDelta) >= 3
        );

    if (
        metricLooksFlat &&
        hasLargeMovements
    ) {
        risks.push(
            buildVolatilityRisk()
        );
    }

    // ---------------------------------------------------------
    // Sort by severity then impact
    // ---------------------------------------------------------

    const severityWeight: Record<RiskSeverity, number> = {
        HIGH: 3,
        MEDIUM: 2,
        LOW: 1
    };

    return risks
        .sort((a, b) => {

            const severityDiff =
                severityWeight[b.severity] -
                severityWeight[a.severity];

            if (severityDiff !== 0) {
                return severityDiff;
            }

            return b.impactScore - a.impactScore;
        })
        .slice(0, 10);
}