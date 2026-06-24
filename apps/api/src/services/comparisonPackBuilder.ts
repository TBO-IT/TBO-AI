import { executeQuery } from "./queryExecutionService.js";
import { EnrichedSemanticLayer } from "../ai/semanticLayer.js";

export interface EntityComparisonProfile {
    entity: string;
    volume: number;
    winRate: number;
    worstApw: string;
    worstDestination: string;
    biggestWeakness: string;
    biggestOpportunity: string;
}

export interface ComparisonPack {
    entities: EntityComparisonProfile[];
    winner: string;
    loser: string;
    focusAreas: string[];
    recommendedAction: string;
    metricName: string;
}

async function profileEntity(
    entityName: string,
    dimension: string,
    physicalCol: string,
    metricFormula: string,
    metricName: string,
    csvPath: string
): Promise<EntityComparisonProfile> {
    const safeEntity = entityName.replace(/'/g, "''");
    const entityCond = dimension === "thirdparty"
        ? `LOWER(TRIM("${physicalCol}")) = LOWER(TRIM('${safeEntity}'))`
        : `"${physicalCol}" ILIKE '%${safeEntity}%'`;

    const baseWhere = `WHERE ${entityCond}`;

    const summarySql = `
        SELECT
            COUNT(*) AS volume,
            ROUND(${metricFormula}, 4) AS metric_value
        FROM data_table
        ${baseWhere}
    `;
    const summary = await executeQuery(summarySql, csvPath);
    const volume = Number(summary[0]?.volume ?? 0);
    const winRate = Number(summary[0]?.metric_value ?? 0);

    const apwSql = `
        SELECT "apw_bucket_new" AS apw, ROUND(${metricFormula}, 4) AS metric_value, COUNT(*) AS vol
        FROM data_table
        ${baseWhere} AND "apw_bucket_new" IS NOT NULL
        GROUP BY "apw_bucket_new"
        ORDER BY metric_value ASC
        LIMIT 1
    `;
    const apwRows = await executeQuery(apwSql, csvPath);
    const worstApw = String(apwRows[0]?.apw ?? "N/A");

    const destSql = `
        SELECT destination, ROUND(${metricFormula}, 4) AS metric_value, COUNT(*) AS vol
        FROM data_table
        ${baseWhere} AND destination IS NOT NULL
        GROUP BY destination
        ORDER BY metric_value ASC
        LIMIT 1
    `;
    const destRows = await executeQuery(destSql, csvPath);
    const worstDestination = String(destRows[0]?.destination ?? "N/A");

    const weaknessSql = `
        SELECT "tbo_hotelname" AS name, ROUND(${metricFormula}, 4) AS metric_value, COUNT(*) AS vol
        FROM data_table
        ${baseWhere} AND "tbo_hotelname" IS NOT NULL
        GROUP BY "tbo_hotelname"
        ORDER BY metric_value ASC
        LIMIT 1
    `;
    const weakRows = await executeQuery(weaknessSql, csvPath);
    const biggestWeakness = weakRows[0]
        ? `${weakRows[0].name} (${Number(weakRows[0].metric_value).toFixed(1)}% win rate)`
        : "N/A";

    const oppSql = `
        SELECT "tbo_hotelname" AS name, ROUND(${metricFormula}, 4) AS metric_value, COUNT(*) AS vol
        FROM data_table
        ${baseWhere} AND "tbo_hotelname" IS NOT NULL
        GROUP BY "tbo_hotelname"
        ORDER BY metric_value DESC
        LIMIT 1
    `;
    const oppRows = await executeQuery(oppSql, csvPath);
    const biggestOpportunity = oppRows[0]
        ? `${oppRows[0].name} (${Number(oppRows[0].metric_value).toFixed(1)}% win rate)`
        : "N/A";

    return {
        entity: entityName,
        volume,
        winRate,
        worstApw,
        worstDestination,
        biggestWeakness,
        biggestOpportunity
    };
}

/**
 * Builds a structured comparison pack for two entities.
 */
export async function buildComparisonPack(
    left: string,
    right: string,
    dimension: string,
    physicalCol: string,
    semanticLayer: EnrichedSemanticLayer,
    csvPath: string
): Promise<ComparisonPack> {
    const metric = semanticLayer.metrics.find(m =>
        m.name.toLowerCase().includes("win rate")
    ) || semanticLayer.metrics[0];

    const metricFormula = metric?.formula ?? "AVG(CASE WHEN \"Competitive Status\" = 'Winning' THEN 1.0 ELSE 0.0 END) * 100.0";
    const metricName = metric?.name ?? "Win Rate";

    const [leftProfile, rightProfile] = await Promise.all([
        profileEntity(left, dimension, physicalCol, metricFormula, metricName, csvPath),
        profileEntity(right, dimension, physicalCol, metricFormula, metricName, csvPath)
    ]);

    const profiles = [leftProfile, rightProfile];
    const sorted = [...profiles].sort((a, b) => b.winRate - a.winRate);
    const winner = sorted[0].entity;
    const loser = sorted[1].entity;

    const focusAreas = profiles.flatMap(p => [
        `${p.entity}: weakest APW bucket ${p.worstApw}`,
        `${p.entity}: weakest destination ${p.worstDestination}`
    ]);

    const recommendedAction = `Focus on closing the ${metricName} gap with ${loser} — prioritize ${loser}'s ${sorted[1].worstApw} APW window in ${sorted[1].worstDestination}.`;

    console.log(`[COMPARISON_PACK] winner=${winner} | loser=${loser} | left=${leftProfile.winRate}% | right=${rightProfile.winRate}%`);

    return {
        entities: profiles,
        winner,
        loser,
        focusAreas,
        recommendedAction,
        metricName
    };
}

export function formatComparisonNarrative(pack: ComparisonPack): string {
    const lines = [
        `## Entity Comparison: ${pack.entities.map(e => e.entity).join(" vs ")}`,
        "",
        `**Winner:** ${pack.winner} (${pack.entities.find(e => e.entity === pack.winner)?.winRate.toFixed(1)}% ${pack.metricName})`,
        `**Loser:** ${pack.loser} (${pack.entities.find(e => e.entity === pack.loser)?.winRate.toFixed(1)}% ${pack.metricName})`,
        "",
        "### Entity Profiles",
        ...pack.entities.map(e =>
            `- **${e.entity}**: ${e.volume} rows | ${e.winRate.toFixed(1)}% ${pack.metricName} | Weakest APW: ${e.worstApw} | Weakest Destination: ${e.worstDestination} | Weakness: ${e.biggestWeakness} | Opportunity: ${e.biggestOpportunity}`
        ),
        "",
        "### Focus Areas",
        ...pack.focusAreas.map(f => `- ${f}`),
        "",
        "### Recommended Action",
        pack.recommendedAction
    ];
    return lines.join("\n");
}
