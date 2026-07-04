// ─── Executive Narrative Renderer ─────────────────────────────────────────────
//
// Transforms an ExecutivePack into executive-grade markdown narrative.
//
// This is the "last mile" fix: the system already computes rich intelligence
// via 15 insight engines (risk, opportunity, actionability, scenarios,
// tradeoffs, confidence, strategic implications, etc.). Previously, the
// deterministic narrative path threw ALL of this away and just listed raw rows.
//
// This renderer surfaces the existing computed intelligence.
//
// No Claude involved. Purely deterministic rendering of pre-computed packs.
// ───────────────────────────────────────────────────────────────────────────────

import { ExecutivePack } from "./insights/executivePackBuilder.js";
import { RootCausePack, MetricChange } from "./RootCausePackBuilder.js";
import { PrioritizedInsight } from "./insights/insightPrioritizer.js";
import { logger } from "../lib/logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type RouteType = "ROOT_CAUSE" | "CONTRIBUTION" | "TREND" | "TEMPLATE" |
    "COMPARISON" | "COMPARE_ENTITIES" | "EXECUTIVE_PRIORITY" |
    "COMPETITOR_STRATEGY" | "MULTI_ANALYSIS" | "PERFORMANCE" |
    "LLM" | "CACHE" | string;

export interface RenderContext {
    question: string;
    routeType: RouteType;
    executivePack: ExecutivePack;
    rootCausePack?: RootCausePack | null;
    queryResults?: Record<string, unknown>[];
    competitorName?: string;
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

function fmtNum(v: number | undefined | null, decimals: number = 2): string {
    if (v == null || !isFinite(v)) return "N/A";
    return v.toFixed(decimals);
}

function fmtPct(v: number | undefined | null): string {
    if (v == null || !isFinite(v)) return "N/A";
    return `${v.toFixed(1)}%`;
}

function severityBadge(severity: string): string {
    switch (severity) {
        case "HIGH": return "🔴";
        case "MEDIUM": return "🟡";
        case "LOW": return "🟢";
        default: return "⚪";
    }
}

function directionArrow(direction: string): string {
    switch (direction) {
        case "POSITIVE": return "📈";
        case "NEGATIVE": return "📉";
        case "increase": return "📈";
        case "decline": return "📉";
        case "flat": return "➡️";
        default: return "";
    }
}

// ─── Section Renderers ────────────────────────────────────────────────────────

function renderHeadline(ep: ExecutivePack): string {
    return `## ${ep.headline}\n`;
}

function renderKeyTakeaway(ep: ExecutivePack): string {
    if (!ep.keyTakeaway) return "";
    return `> **Key Takeaway:** ${ep.keyTakeaway}\n`;
}

function renderMetricChange(mc: MetricChange | null | undefined): string {
    if (!mc) return "";
    const arrow = directionArrow(mc.direction);
    const absChange = Math.abs(mc.absoluteChange);

    if (mc.direction === "flat" || absChange < 0.1) {
        return `**Overall Change:** ${arrow} Metric remained stable (${fmtNum(absChange)} percentage points)\n`;
    }

    const verb = mc.direction === "increase" ? "improved" : "declined";
    return `**Overall Change:** ${arrow} Metric ${verb} by **${fmtNum(absChange)} percentage points**\n`;
}

function renderDriversTable(ep: ExecutivePack): string {
    const drivers = ep.topDrivers;
    if (!drivers || drivers.length === 0) return "";

    const lines: string[] = [
        "\n### Key Drivers\n",
        "| Rank | Driver | Impact | Volume Share | Direction |",
        "|------|--------|--------|-------------|-----------|"
    ];

    for (const d of drivers.slice(0, 7)) {
        const arrow = directionArrow(d.direction);
        lines.push(
            `| ${d.priorityRank} | **${d.name}** | ${fmtNum(d.metricDelta)} pp | ${fmtPct(d.volumeSharePct)} | ${arrow} ${d.direction} |`
        );
    }

    return lines.join("\n") + "\n";
}

function renderRisks(ep: ExecutivePack): string {
    const risks = ep.topRisks;
    if (!risks || risks.length === 0) return "";

    const lines = ["\n### ⚠️ Risks\n"];
    for (const r of risks.slice(0, 4)) {
        lines.push(`- ${severityBadge(r.severity)} **${r.title}** — ${r.explanation}`);
    }

    return lines.join("\n") + "\n";
}

function renderOpportunities(ep: ExecutivePack): string {
    const opps = ep.topOpportunities;
    if (!opps || opps.length === 0) return "";

    const lines = ["\n### 💡 Opportunities\n"];
    for (const o of opps.slice(0, 4)) {
        lines.push(`- ${severityBadge(o.severity)} **${o.title}** — ${o.explanation}`);
        if (o.recommendedAction) {
            lines.push(`  - *Action:* ${o.recommendedAction}`);
        }
    }

    return lines.join("\n") + "\n";
}

function renderActions(ep: ExecutivePack): string {
    const actions = ep.topActions;
    if (!actions || actions.length === 0) return "";

    const lines = ["\n### Recommended Actions\n"];
    for (let i = 0; i < Math.min(actions.length, 3); i++) {
        const a = actions[i];
        lines.push(`**${i + 1}. ${a.action}**`);
        if (a.rationale) lines.push(`*Why:* ${a.rationale}`);
        lines.push("");
    }

    return lines.join("\n") + "\n";
}

function renderPrimaryTarget(ep: ExecutivePack): string {
    const target = ep.primaryTarget;
    if (!target) return "";

    const lines = [
        "\n### 🎯 Primary Target\n",
        "| Attribute | Value |",
        "|-----------|-------|",
        `| **Target** | ${target.name} |`,
        `| **Type** | ${target.entityType} |`,
        `| **Metric Impact** | ${fmtNum(target.metricDelta)} percentage points |`,
        `| **Volume Share** | ${fmtPct(target.volumeShare)} |`,
        `| **Resource Allocation Score** | ${fmtNum(target.resourceAllocationScore)} |`,
        `| **Why Selected** | ${target.selectionRationale} |`,
    ];

    return lines.join("\n") + "\n";
}

function renderDrilldowns(ep: ExecutivePack): string {
    const drilldowns = ep.drilldowns;
    if (!drilldowns || drilldowns.length === 0) return "";

    const lines = ["\n### Drilldown Analysis\n"];
    for (const d of drilldowns.slice(0, 5)) {
        lines.push(`- **${d.name}** (${d.entityType}): ${d.reason}`);
    }

    return lines.join("\n") + "\n";
}

function renderRecommendations(ep: ExecutivePack): string {
    const recs = ep.recommendations;
    if (!recs || recs.length === 0) return "";

    const lines = ["\n### Targeted Recommendations\n"];
    for (let i = 0; i < Math.min(recs.length, 4); i++) {
        const r = recs[i];
        lines.push(`**${i + 1}. [${r.targetType}] ${r.targetName}**`);
        lines.push(`${r.reason}`);
        lines.push(`*Expected Impact:* ${r.expectedImpact}`);
        lines.push("");
    }

    return lines.join("\n") + "\n";
}

function renderScenarios(ep: ExecutivePack): string {
    const scenarios = ep.scenarios;
    if (!scenarios || scenarios.length === 0) return "";

    const lines = ["\n### Scenarios\n"];
    for (const s of scenarios) {
        const emoji = s.type === "BEST_CASE" ? "🟢" : s.type === "WORST_CASE" ? "🔴" : "🟡";
        lines.push(`- ${emoji} **${s.type.replace(/_/g, " ")}:** ${s.description}`);
    }

    return lines.join("\n") + "\n";
}

function renderStrategicImplications(ep: ExecutivePack): string {
    const implications = ep.strategicImplications;
    if (!implications || implications.length === 0) return "";

    const lines = ["\n### Strategic Implications\n"];
    for (const si of implications.slice(0, 3)) {
        lines.push(`- ${severityBadge(si.severity)} ${si.implication}`);
    }

    return lines.join("\n") + "\n";
}

function renderTradeoffs(ep: ExecutivePack): string {
    const tradeoffs = ep.tradeoffs;
    if (!tradeoffs || tradeoffs.length === 0) return "";

    const lines = ["\n### Executive Tradeoffs\n"];
    for (const t of tradeoffs.slice(0, 3)) {
        lines.push(`- **${t.title}:** ${t.explanation}`);
    }

    return lines.join("\n") + "\n";
}

function renderConfidence(ep: ExecutivePack): string {
    const ca = ep.confidenceAssessment;
    if (!ca) return "";

    const emoji = ca.confidence === "HIGH" ? "🟢" : ca.confidence === "MEDIUM" ? "🟡" : "🔴";
    return `\n---\n*${emoji} ${ca.rationale}*\n`;
}

function renderLeadershipMessage(ep: ExecutivePack): string {
    if (!ep.leadershipMessage) return "";
    return `\n**Leadership:** ${ep.leadershipMessage}\n`;
}

function renderCompetitiveGaps(ep: ExecutivePack, competitorName?: string): string {
    const gaps = ep.competitiveGaps;
    if (!gaps || gaps.length === 0) return "";

    const label = competitorName ? ` vs ${competitorName}` : "";
    const lines = [
        `\n### Competitive Gaps${label}\n`,
        "| Segment | Our Metric | Competitor | Gap | Action |",
        "|---------|-----------|------------|-----|--------|"
    ];

    for (const g of gaps.slice(0, 8)) {
        lines.push(
            `| ${g.dimension} | ${fmtNum(g.ourMetric, 4)} | ${fmtNum(g.competitorMetric, 4)} | **${fmtNum(g.gap, 4)}** | ${g.recommendation} |`
        );
    }

    return lines.join("\n") + "\n";
}

// ─── Statistical Summary from Raw Results ─────────────────────────────────────

function renderStatisticalSummary(results: Record<string, unknown>[]): string {
    if (!results || results.length < 3) return "";

    const cols = Object.keys(results[0]);
    const numericCols = cols.filter(c => typeof results[0][c] === "number");
    if (numericCols.length === 0) return "";

    const lines = ["\n### Statistical Summary\n"];

    for (const col of numericCols.slice(0, 4)) {
        const values = results
            .map(r => Number(r[col]))
            .filter(v => isFinite(v));

        if (values.length === 0) continue;

        const sum = values.reduce((a, b) => a + b, 0);
        const mean = sum / values.length;
        const sorted = [...values].sort((a, b) => a - b);
        const median = sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)];
        const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
        const stddev = Math.sqrt(variance);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];

        // Concentration: top 3 share
        const topN = Math.min(3, values.length);
        const topValues = [...values].sort((a, b) => b - a).slice(0, topN);
        const topShare = sum > 0 ? (topValues.reduce((a, b) => a + b, 0) / sum) * 100 : 0;

        lines.push(`**${col}:** Mean ${fmtNum(mean)} | Median ${fmtNum(median)} | Std Dev ${fmtNum(stddev)} | Range [${fmtNum(min)} – ${fmtNum(max)}]`);

        if (topShare > 60 && values.length > 5) {
            lines.push(`  ⚠️ *Top ${topN} entities control ${fmtPct(topShare)} — high concentration*`);
        }

        // Outliers (>2σ from mean)
        const outliers = results.filter(r => {
            const v = Number(r[col]);
            return isFinite(v) && Math.abs(v - mean) > 2 * stddev;
        });

        if (outliers.length > 0 && stddev > 0) {
            const dimCol = cols.find(c => typeof results[0][c] === "string");
            if (dimCol) {
                const outlierNames = outliers
                    .slice(0, 3)
                    .map(o => `${o[dimCol]} (${fmtNum(Number(o[col]))})`)
                    .join(", ");
                lines.push(`  📊 *Outliers (>2σ):* ${outlierNames}`);
            }
        }
    }

    return lines.join("\n") + "\n";
}

// ─── Data Table Renderer ──────────────────────────────────────────────────────

function renderDataTable(results: Record<string, unknown>[], maxRows: number = 10): string {
    if (!results || results.length === 0) return "";

    const cols = Object.keys(results[0]);
    const displayRows = results.slice(0, maxRows);

    const lines = [
        "\n### Data\n",
        `| ${cols.join(" | ")} |`,
        `| ${cols.map(() => "---").join(" | ")} |`
    ];

    for (const row of displayRows) {
        const cells = cols.map(c => {
            const v = row[c];
            if (typeof v === "number") {
                return Number.isInteger(v) ? v.toLocaleString() : fmtNum(v);
            }
            return String(v ?? "");
        });
        lines.push(`| ${cells.join(" | ")} |`);
    }

    if (results.length > maxRows) {
        lines.push(`\n*Showing top ${maxRows} of ${results.length} results.*`);
    }

    return lines.join("\n") + "\n";
}

// ─── Route-Specific Renderers ─────────────────────────────────────────────────

function renderRootCauseNarrative(ctx: RenderContext): string {
    const { executivePack: ep, rootCausePack: rcp } = ctx;

    const sections: string[] = [
        renderHeadline(ep),
        renderKeyTakeaway(ep),
        renderMetricChange(rcp?.metricChange),
        renderPrimaryTarget(ep),
        renderDriversTable(ep),
        renderRisks(ep),
        renderOpportunities(ep),
        renderActions(ep),
        renderDrilldowns(ep),
        renderRecommendations(ep),
        renderScenarios(ep),
        renderStrategicImplications(ep),
        renderTradeoffs(ep),
        renderLeadershipMessage(ep),
        renderConfidence(ep),
    ];

    return sections.filter(Boolean).join("\n");
}

function renderContributionNarrative(ctx: RenderContext): string {
    const { executivePack: ep, rootCausePack: rcp, queryResults } = ctx;

    const sections: string[] = [
        renderHeadline(ep),
        renderKeyTakeaway(ep),
        renderMetricChange(rcp?.metricChange),
        renderDriversTable(ep),
        renderPrimaryTarget(ep),
        renderRisks(ep),
        renderOpportunities(ep),
        renderActions(ep),
        renderLeadershipMessage(ep),
        renderConfidence(ep),
    ];

    return sections.filter(Boolean).join("\n");
}

function renderCompetitorNarrative(ctx: RenderContext): string {
    const { executivePack: ep } = ctx;

    const sections: string[] = [
        renderHeadline(ep),
        renderKeyTakeaway(ep),
        renderCompetitiveGaps(ep, ctx.competitorName),
        renderPrimaryTarget(ep),
        renderDrilldowns(ep),
        renderRecommendations(ep),
        renderActions(ep),
        renderLeadershipMessage(ep),
        renderConfidence(ep),
    ];

    return sections.filter(Boolean).join("\n");
}

function renderTemplateNarrative(ctx: RenderContext): string {
    const { question, queryResults } = ctx;

    const sections: string[] = [];

    sections.push(`## Results\n`);

    // Statistical context first
    if (queryResults && queryResults.length >= 3) {
        sections.push(renderStatisticalSummary(queryResults));
    }

    // Data table
    if (queryResults) {
        sections.push(renderDataTable(queryResults, 15));
    }

    return sections.filter(Boolean).join("\n");
}

function renderTrendNarrative(ctx: RenderContext): string {
    const { executivePack: ep, queryResults } = ctx;

    const sections: string[] = [];

    if (ep) {
        sections.push(renderHeadline(ep));
        sections.push(renderKeyTakeaway(ep));
    }

    // Data table for trend results
    if (queryResults) {
        sections.push(renderDataTable(queryResults, 20));
    }

    if (queryResults && queryResults.length >= 3) {
        sections.push(renderStatisticalSummary(queryResults));
    }

    if (ep) {
        sections.push(renderStrategicImplications(ep));
        sections.push(renderConfidence(ep));
    }

    return sections.filter(Boolean).join("\n");
}

function renderPerformanceNarrative(ctx: RenderContext): string {
    const { executivePack: ep, rootCausePack: rcp } = ctx;

    const sections: string[] = [
        renderHeadline(ep),
        renderKeyTakeaway(ep),
        renderMetricChange(rcp?.metricChange),
        renderPrimaryTarget(ep),
        renderDriversTable(ep),
        renderRisks(ep),
        renderOpportunities(ep),
        renderActions(ep),
        renderScenarios(ep),
        renderLeadershipMessage(ep),
        renderConfidence(ep),
    ];

    return sections.filter(Boolean).join("\n");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Renders an executive-grade narrative from a pre-computed ExecutivePack.
 *
 * Adapts the format based on the route type:
 * - ROOT_CAUSE / MULTI_ANALYSIS: Full analysis with drivers, risks, opportunities, scenarios
 * - CONTRIBUTION: Waterfall-style driver analysis
 * - COMPETITOR_STRATEGY: Competitive gap analysis
 * - TEMPLATE / TREND: Data table with statistical context
 * - PERFORMANCE: Multi-dimensional scorecard
 * - EXECUTIVE_PRIORITY: Decision brief (uses existing buildExecutivePriorityNarrative)
 *
 * Falls back to a statistical data table if no ExecutivePack is available.
 */
export function renderExecutiveNarrative(ctx: RenderContext): string {
    const { routeType, executivePack: ep, queryResults } = ctx;

    logger.info({
        routeType,
        hasExecutivePack: !!ep,
        hasPrimaryTarget: !!ep?.primaryTarget,
        driversCount: ep?.topDrivers?.length ?? 0,
        risksCount: ep?.topRisks?.length ?? 0,
        oppsCount: ep?.topOpportunities?.length ?? 0,
        resultRows: queryResults?.length ?? 0,
    }, "Executive narrative render");

    // Route-specific rendering
    switch (routeType) {
        case "ROOT_CAUSE":
        case "MULTI_ANALYSIS":
            return renderRootCauseNarrative(ctx);

        case "CONTRIBUTION":
            return renderContributionNarrative(ctx);

        case "COMPETITOR_STRATEGY":
            return renderCompetitorNarrative(ctx);

        case "PERFORMANCE":
            return renderPerformanceNarrative(ctx);

        case "TREND":
            return renderTrendNarrative(ctx);

        case "TEMPLATE":
        case "CACHE":
            return renderTemplateNarrative(ctx);

        default:
            // Generic fallback: try executive format if pack exists, else data table
            if (ep && (ep.topDrivers?.length > 0 || ep.primaryTarget)) {
                return renderRootCauseNarrative(ctx);
            }
            return renderTemplateNarrative(ctx);
    }
}

/**
 * Enhanced deterministic narrative for routes without an ExecutivePack.
 *
 * Replaces the old buildDeterministicNarrative which just listed raw rows.
 * Adds statistical context (mean, stddev, outliers, concentration).
 */
export function renderEnhancedDeterministicNarrative(
    question: string,
    queryResults: Record<string, unknown>[],
    insights: string[]
): string {
    if (!queryResults || queryResults.length === 0) {
        return "No data found for this query.";
    }

    // Single row: format as key-value pairs
    if (queryResults.length === 1) {
        const row = queryResults[0];
        const facts = Object.entries(row).map(([k, v]) => {
            const formatted = typeof v === "number"
                ? (Number.isInteger(v) ? v.toLocaleString() : fmtNum(v))
                : String(v ?? "");
            return `- **${k}**: ${formatted}`;
        }).join("\n");
        return `Based on the data:\n\n${facts}`;
    }

    const sections: string[] = [];

    // Statistical summary (the key intelligence upgrade)
    sections.push(renderStatisticalSummary(queryResults));

    // Data table
    sections.push(renderDataTable(queryResults, 10));

    // Legacy insights (enhanced in insightEngine.ts)
    if (insights.length > 0 && insights[0] !== "No data available for insights.") {
        sections.push("\n### Key Observations\n");
        for (const insight of insights) {
            sections.push(`- ${insight}`);
        }
        sections.push("");
    }

    return sections.filter(Boolean).join("\n");
}
