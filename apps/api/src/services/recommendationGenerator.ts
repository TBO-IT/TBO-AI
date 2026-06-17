// ─── Recommendation Generator ─────────────────────────────────────────────────
//
// Generates actionable recommendations from a ClaudeInputPack.
//
// Strategy:
//   1. Always run deterministic rule-based recommendations (no LLM cost)
//   2. Optionally enrich with Claude Sonnet for strategic depth
//   3. Fall back to deterministic if Claude fails
//
// Each recommendation cites: action, rationale, supportingEvidence, expectedImpact.
// ───────────────────────────────────────────────────────────────────────────────

import { ClaudeInputPack, ClaudeContributorSummary, assertClaudeInputSafe } from "./claudeInputContract.js";
import { routeClaude } from "./claudeRouter.js";
import { generateText, AnthropicClientError } from "./anthropicClient.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Recommendation {
    /** Actionable title */
    action: string;

    /** Why this action is important */
    rationale: string;

    /** Data points that support this recommendation */
    supportingEvidence: string[];

    /** What outcome is expected */
    expectedImpact: string;

    /** Affected dimension */
    affectedDimension: string;

    /** Affected entity names */
    affectedEntities: string[];

    /** Priority */
    priority: "HIGH" | "MEDIUM" | "LOW";

    /** Source: "DETERMINISTIC" or "CLAUDE" */
    source: "DETERMINISTIC" | "CLAUDE";
}

export interface RecommendationResult {
    recommendations: Recommendation[];
    claudeTier: string;
    claudeUsed: boolean;
    claudeFailed: boolean;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates recommendations from a ClaudeInputPack.
 *
 * @param pack - Validated analytics pack
 * @param enableClaude - Whether to use Claude for enrichment (Sonnet tier)
 */
export async function generateRecommendations(
    pack: ClaudeInputPack,
    enableClaude: boolean = false
): Promise<RecommendationResult> {
    // 1. Always generate deterministic recommendations
    const deterministicRecs = buildDeterministicRecommendations(pack);

    // 2. Check Claude routing
    const routing = enableClaude
        ? routeClaude("ROOT_CAUSE", "RECOMMENDATIONS", true)
        : routeClaude("TEMPLATE", null, false);

    if (!routing.shouldCallClaude || !enableClaude) {
        return {
            recommendations: deterministicRecs,
            claudeTier: "NONE",
            claudeUsed: false,
            claudeFailed: false
        };
    }

    // 3. Safety gate
    try {
        assertClaudeInputSafe(pack);
    } catch (err) {
        console.error("[RECOMMENDATION_ENGINE] Safety check failed:", err);
        return {
            recommendations: deterministicRecs,
            claudeTier: "NONE",
            claudeUsed: false,
            claudeFailed: false
        };
    }

    // 4. Call Claude Sonnet for strategic recommendations
    try {
        const prompt = buildRecommendationPrompt(pack);
        const result = await generateText({
            prompt,
            systemPrompt: RECOMMENDATION_SYSTEM_PROMPT,
            tier: "SONNET",
            maxTokens: routing.maxTokens,
            temperature: 0.2,
            operation: "RECOMMENDATIONS"
        });

        const claudeRecs = parseClaudeRecommendations(result.text, pack);

        console.log(
            `[RECOMMENDATION_ENGINE] Claude generated ${claudeRecs.length} recommendations | ` +
            `deterministic=${deterministicRecs.length} | tokens=${result.inputTokens}/${result.outputTokens}`
        );

        // Merge: deterministic first, then Claude-only additions
        const merged = mergeRecommendations(deterministicRecs, claudeRecs);

        return {
            recommendations: merged,
            claudeTier: routing.tier,
            claudeUsed: true,
            claudeFailed: false
        };
    } catch (err) {
        console.error("[RECOMMENDATION_ENGINE] Claude failed — using deterministic only:", err);
        return {
            recommendations: deterministicRecs,
            claudeTier: routing.tier,
            claudeUsed: false,
            claudeFailed: true
        };
    }
}

// ─── Deterministic Rules ──────────────────────────────────────────────────────

function buildDeterministicRecommendations(pack: ClaudeInputPack): Recommendation[] {
    const recs: Recommendation[] = [];

    // Rule 1: Investigate top negative contributors
    const topNeg = pack.topNegativeContributors.slice(0, 3);
    if (topNeg.length > 0) {
        const names = topNeg.map(c => c.name);
        const totalDrag = topNeg.reduce((s, c) => s + c.weightedContribution, 0);
        recs.push({
            action: `Investigate Underperformance: ${names.join(", ")}`,
            rationale: `These ${names.length} entities are the largest drags on ${pack.metricName}, ` +
                `accounting for ${totalDrag.toFixed(2)} points of negative impact.`,
            supportingEvidence: topNeg.map(c =>
                `${c.name}: ${c.weightedContribution.toFixed(2)} pts, ${c.volumeSharePct.toFixed(1)}% volume`
            ),
            expectedImpact: `Recovering ${Math.abs(totalDrag).toFixed(2)} points on ${pack.metricName}.`,
            affectedDimension: detectDimension(topNeg[0], pack),
            affectedEntities: names,
            priority: "HIGH",
            source: "DETERMINISTIC"
        });
    }

    // Rule 2: Replicate top performers
    const topPos = pack.topPositiveContributors.slice(0, 2);
    for (const c of topPos) {
        recs.push({
            action: `Replicate Strategy: ${c.name}`,
            rationale: `${c.name} contributed +${c.weightedContribution.toFixed(2)} points. Analyze and replicate.`,
            supportingEvidence: [
                `Metric: ${c.metricValue.toFixed(2)}`,
                `Volume share: ${c.volumeSharePct.toFixed(1)}%`,
                `Contribution: +${c.weightedContribution.toFixed(2)} pts`
            ],
            expectedImpact: `+${(c.weightedContribution * 1.5).toFixed(2)} points if replicated.`,
            affectedDimension: detectDimension(c, pack),
            affectedEntities: [c.name],
            priority: "MEDIUM",
            source: "DETERMINISTIC"
        });
    }

    // Rule 3: High-volume underperformers
    const allEntities = [
        ...pack.affectedHotels.map(e => ({ ...e, dim: "hotel" })),
        ...pack.affectedChains.map(e => ({ ...e, dim: "chain" })),
        ...pack.affectedSuppliers.map(e => ({ ...e, dim: "supplier" }))
    ];
    const underperformers = allEntities
        .filter(e => e.volumeSharePct > 5 && e.metricDelta < -1)
        .sort((a, b) => a.weightedContribution - b.weightedContribution)
        .slice(0, 2);

    for (const e of underperformers) {
        recs.push({
            action: `High-Volume Opportunity: ${e.name}`,
            rationale: `${e.name} holds ${e.volumeSharePct.toFixed(1)}% volume but underperforms by ${Math.abs(e.metricDelta).toFixed(2)} points.`,
            supportingEvidence: [
                `Volume share: ${e.volumeSharePct.toFixed(1)}%`,
                `Metric delta: ${e.metricDelta.toFixed(2)} pts`,
                `Weighted contribution: ${e.weightedContribution.toFixed(2)} pts`
            ],
            expectedImpact: `${(e.volumeSharePct / 100 * Math.abs(e.metricDelta) / 2).toFixed(2)} points on overall ${pack.metricName}.`,
            affectedDimension: e.dim,
            affectedEntities: [e.name],
            priority: "HIGH",
            source: "DETERMINISTIC"
        });
    }

    // Rule 4: Churn detection
    const churned = allEntities.filter(e => e.volume === 0 && e.weightedContribution < -0.1);
    if (churned.length > 0) {
        recs.push({
            action: `Churn Alert: ${churned.length} Entities Lost`,
            rationale: `${churned.length} entities have zero volume in the current period.`,
            supportingEvidence: churned.slice(0, 5).map(c =>
                `${c.name}: ${c.weightedContribution.toFixed(2)} pts impact`
            ),
            expectedImpact: `Recovering ${Math.abs(churned.reduce((s, c) => s + c.weightedContribution, 0)).toFixed(2)} points.`,
            affectedDimension: "multiple",
            affectedEntities: churned.slice(0, 5).map(c => c.name),
            priority: "HIGH",
            source: "DETERMINISTIC"
        });
    }

    // Rule 5: Contradiction
    if (pack.contradictionDetected) {
        recs.push({
            action: "Reassess Analytical Assumptions",
            rationale: `Expected ${pack.expectedDirection}, but data shows ${pack.metricChange?.direction}.`,
            supportingEvidence: [
                `Expected: ${pack.expectedDirection}`,
                `Actual: ${pack.metricChange?.direction} (${pack.metricChange?.absoluteChange?.toFixed(2)} pts)`
            ],
            expectedImpact: "Prevents misguided interventions.",
            affectedDimension: "overall",
            affectedEntities: [],
            priority: "HIGH",
            source: "DETERMINISTIC"
        });
    }

    // Sort by priority
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    recs.sort((a, b) => order[a.priority] - order[b.priority]);

    return recs.slice(0, 10);
}

// ─── Claude Prompt ────────────────────────────────────────────────────────────

const RECOMMENDATION_SYSTEM_PROMPT =
    "You are a Strategic Travel Industry Consultant. " +
    "Given analytics data, generate 3-5 actionable recommendations.\n\n" +
    "RULES:\n" +
    "1. Use ONLY the facts provided. Do NOT invent data.\n" +
    "2. Each recommendation must have: Action, Rationale, Expected Impact.\n" +
    "3. Cite specific entity names and numbers from the data.\n" +
    "4. Focus on strategic business actions, not technical fixes.\n" +
    "5. Format each recommendation as:\n" +
    "   ACTION: [action]\n" +
    "   RATIONALE: [why]\n" +
    "   EVIDENCE: [data points]\n" +
    "   IMPACT: [expected outcome]";

function buildRecommendationPrompt(pack: ClaudeInputPack): string {
    const sections: string[] = [];

    sections.push(`QUESTION: "${pack.question}"`);
    sections.push(`METRIC: ${pack.metricName}`);

    if (pack.metricChange) {
        sections.push(`CHANGE: ${pack.metricChange.absoluteChange > 0 ? "+" : ""}${pack.metricChange.absoluteChange.toFixed(2)} points (${pack.metricChange.direction})`);
    }

    if (pack.topPositiveContributors.length > 0) {
        sections.push("\nTOP POSITIVE:");
        for (const c of pack.topPositiveContributors.slice(0, 5)) {
            sections.push(`  • ${c.name}: +${c.weightedContribution.toFixed(2)} pts, ${c.volumeSharePct.toFixed(1)}% vol`);
        }
    }

    if (pack.topNegativeContributors.length > 0) {
        sections.push("\nTOP NEGATIVE:");
        for (const c of pack.topNegativeContributors.slice(0, 5)) {
            sections.push(`  • ${c.name}: ${c.weightedContribution.toFixed(2)} pts, ${c.volumeSharePct.toFixed(1)}% vol`);
        }
    }

    if (pack.contradictionDetected) {
        sections.push(`\nCONTRADICTION: Expected "${pack.expectedDirection}", actual "${pack.metricChange?.direction}".`);
    }

    sections.push("\nGenerate 3-5 strategic recommendations based ONLY on the data above.");

    return sections.join("\n");
}

// ─── Response Parsing ─────────────────────────────────────────────────────────

function parseClaudeRecommendations(text: string, pack: ClaudeInputPack): Recommendation[] {
    const recs: Recommendation[] = [];

    // Split on "ACTION:" delimiters
    const blocks = text.split(/\n\s*ACTION:\s*/i).filter(b => b.trim().length > 0);

    for (const block of blocks.slice(0, 5)) {
        const actionMatch = block.match(/^(.+?)(?:\n|$)/);
        const rationaleMatch = block.match(/RATIONALE:\s*(.+?)(?:\n|$)/i);
        const evidenceMatch = block.match(/EVIDENCE:\s*(.+?)(?:\n|$)/i);
        const impactMatch = block.match(/IMPACT:\s*(.+?)(?:\n|$)/i);

        if (actionMatch) {
            recs.push({
                action: actionMatch[1].trim(),
                rationale: rationaleMatch?.[1]?.trim() ?? "",
                supportingEvidence: evidenceMatch?.[1]?.trim().split(/[;,]/).map(s => s.trim()).filter(Boolean) ?? [],
                expectedImpact: impactMatch?.[1]?.trim() ?? "",
                affectedDimension: "strategic",
                affectedEntities: [],
                priority: "MEDIUM",
                source: "CLAUDE"
            });
        }
    }

    return recs;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mergeRecommendations(deterministic: Recommendation[], claude: Recommendation[]): Recommendation[] {
    // Deterministic go first (they're data-verified), then Claude additions
    const seen = new Set(deterministic.map(r => r.action.toLowerCase()));
    const unique = claude.filter(r => !seen.has(r.action.toLowerCase()));
    return [...deterministic, ...unique].slice(0, 10);
}

function detectDimension(entry: ClaudeContributorSummary, pack: ClaudeInputPack): string {
    if (pack.affectedHotels.some(e => e.name === entry.name)) return "hotel";
    if (pack.affectedChains.some(e => e.name === entry.name)) return "chain";
    if (pack.affectedSuppliers.some(e => e.name === entry.name)) return "supplier";
    if (pack.affectedAPWBuckets.some(e => e.name === entry.name)) return "apw";
    return "unknown";
}
