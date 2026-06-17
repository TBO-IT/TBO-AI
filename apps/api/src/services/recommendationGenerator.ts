// ─── Recommendation Generator ─────────────────────────────────────────────────
//
// Generates strategic recommendations from a ClaudeInputPack using Claude Sonnet.
//
// Exported functions:
//   buildRecommendationPrompt(pack) → string
//   generateRecommendations(pack)   → RecommendationResult
//
// Each recommendation must contain:
//   { action, rationale, supportingEvidence, expectedImpact }
//
// Uses Sonnet ONLY. Falls back to deterministic if Claude fails.
// ───────────────────────────────────────────────────────────────────────────────

import { ClaudeInputPack, assertClaudeInputSafe } from "./claudeInputContract.js";
import { generateRecommendationText, AnthropicClientError } from "./anthropicClient.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Recommendation {
    action: string;
    rationale: string;
    supportingEvidence: string[];
    expectedImpact: string;
}

export interface RecommendationResult {
    recommendations: Recommendation[];
    claudeUsed: boolean;
    claudeFailed: boolean;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
    `You are a Strategic Travel Industry Consultant advising a C-level executive.

RULES:
1. Use ONLY the data facts provided. NEVER invent numbers or entity names.
2. Generate 3-5 actionable recommendations.
3. Each recommendation MUST reference specific entities and numbers from the data.
4. Focus on strategic business actions, not technical fixes.

FORMAT each recommendation EXACTLY as:

ACTION: [one-line actionable directive]
RATIONALE: [why this matters, citing specific data]
EVIDENCE: [comma-separated data points from the provided facts]
IMPACT: [expected business outcome]

Separate each recommendation with a blank line.`;

// ─── Public: buildRecommendationPrompt ────────────────────────────────────────

/**
 * Builds the Claude prompt. Exported for testing.
 */
export function buildRecommendationPrompt(pack: ClaudeInputPack): string {
    const lines: string[] = [];

    lines.push(`USER QUESTION: "${pack.question}"`);
    lines.push(`METRIC: ${pack.metricName}`);

    if (pack.metricChange) {
        lines.push(`OVERALL CHANGE: ${pack.metricChange.absoluteChange > 0 ? "+" : ""}${pack.metricChange.absoluteChange.toFixed(2)} points (${pack.metricChange.direction})`);
        lines.push(`PERIOD: ${pack.metricChange.priorPeriod} → ${pack.metricChange.currentPeriod}`);
    }

    if (pack.contradictionDetected) {
        lines.push("");
        lines.push(`CONTRADICTION: User expected "${pack.expectedDirection}", data shows "${pack.metricChange?.direction}".`);
    }

    if (pack.topPositiveContributors.length > 0) {
        lines.push("");
        lines.push("TOP POSITIVE CONTRIBUTORS:");
        for (const c of pack.topPositiveContributors.slice(0, 5)) {
            lines.push(`  • ${c.name}: +${c.weightedContribution.toFixed(2)} pts, ${c.volumeSharePct.toFixed(1)}% volume, metric=${c.metricValue.toFixed(2)}`);
        }
    }

    if (pack.topNegativeContributors.length > 0) {
        lines.push("");
        lines.push("TOP NEGATIVE CONTRIBUTORS:");
        for (const c of pack.topNegativeContributors.slice(0, 5)) {
            lines.push(`  • ${c.name}: ${c.weightedContribution.toFixed(2)} pts, ${c.volumeSharePct.toFixed(1)}% volume, metric=${c.metricValue.toFixed(2)}`);
        }
    }

    // High-volume underperformers
    const allEntities = [
        ...pack.affectedHotels,
        ...pack.affectedChains,
        ...pack.affectedSuppliers
    ];
    const underperformers = allEntities
        .filter(e => e.volumeSharePct > 5 && e.metricDelta < -1)
        .sort((a, b) => a.weightedContribution - b.weightedContribution)
        .slice(0, 3);

    if (underperformers.length > 0) {
        lines.push("");
        lines.push("HIGH-VOLUME UNDERPERFORMERS:");
        for (const e of underperformers) {
            lines.push(`  • ${e.name}: ${e.volumeSharePct.toFixed(1)}% volume, delta=${e.metricDelta.toFixed(2)} pts`);
        }
    }

    lines.push("");
    lines.push(`TOTAL DATA POINTS: ${pack.totalRows}`);
    lines.push("");
    lines.push("Generate 3-5 strategic recommendations based ONLY on the data above.");

    return lines.join("\n");
}

// ─── Public: generateRecommendations ──────────────────────────────────────────

/**
 * Generates strategic recommendations using Claude Sonnet.
 * Falls back to deterministic if Claude fails.
 */
export async function generateRecommendations(pack: ClaudeInputPack): Promise<RecommendationResult> {
    // 1. Safety gate
    try {
        assertClaudeInputSafe(pack);
    } catch (err) {
        console.error("[RECOMMENDATION_ENGINE] Safety gate blocked:", err);
        return {
            recommendations: buildDeterministicRecommendations(pack),
            claudeUsed: false,
            claudeFailed: false
        };
    }

    // 2. Build prompt
    const prompt = buildRecommendationPrompt(pack);

    // 3. Call Claude Sonnet
    try {
        const result = await generateRecommendationText(prompt, SYSTEM_PROMPT);
        const recommendations = parseClaudeRecommendations(result.text);

        console.log(
            `[RECOMMENDATION_ENGINE] Claude Sonnet returned ${recommendations.length} recommendations | ` +
            `cost=$${result.estimatedCost.toFixed(4)}`
        );

        // If Claude returned nothing useful, fall back
        if (recommendations.length === 0) {
            console.warn("[RECOMMENDATION_ENGINE] Claude returned 0 recommendations — using deterministic");
            return {
                recommendations: buildDeterministicRecommendations(pack),
                claudeUsed: true,
                claudeFailed: true
            };
        }

        return {
            recommendations,
            claudeUsed: true,
            claudeFailed: false
        };
    } catch (err: any) {
        console.error(`[RECOMMENDATION_ENGINE] Claude Sonnet failed (${err.code ?? "UNKNOWN"}) — using deterministic`);
        return {
            recommendations: buildDeterministicRecommendations(pack),
            claudeUsed: false,
            claudeFailed: true
        };
    }
}

// ─── Claude Response Parser ───────────────────────────────────────────────────

function parseClaudeRecommendations(text: string): Recommendation[] {
    const recs: Recommendation[] = [];

    // Split on ACTION: delimiters
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
                supportingEvidence: evidenceMatch?.[1]?.trim()
                    .split(/[;,]/)
                    .map(s => s.trim())
                    .filter(Boolean) ?? [],
                expectedImpact: impactMatch?.[1]?.trim() ?? ""
            });
        }
    }

    return recs;
}

// ─── Deterministic Fallback ───────────────────────────────────────────────────

function buildDeterministicRecommendations(pack: ClaudeInputPack): Recommendation[] {
    const recs: Recommendation[] = [];

    // Investigate top negative contributors
    const topNeg = pack.topNegativeContributors.slice(0, 3);
    if (topNeg.length > 0) {
        const names = topNeg.map(c => c.name);
        const totalDrag = topNeg.reduce((s, c) => s + c.weightedContribution, 0);
        recs.push({
            action: `Investigate underperformance in ${names.join(", ")}`,
            rationale: `These entities account for ${totalDrag.toFixed(2)} points of negative impact on ${pack.metricName}.`,
            supportingEvidence: topNeg.map(c =>
                `${c.name}: ${c.weightedContribution.toFixed(2)} pts, ${c.volumeSharePct.toFixed(1)}% volume`
            ),
            expectedImpact: `Recovering ${Math.abs(totalDrag).toFixed(2)} points on ${pack.metricName}.`
        });
    }

    // Replicate top performers
    const topPos = pack.topPositiveContributors.slice(0, 2);
    for (const c of topPos) {
        recs.push({
            action: `Replicate the strategy of ${c.name}`,
            rationale: `${c.name} contributed +${c.weightedContribution.toFixed(2)} points to ${pack.metricName}.`,
            supportingEvidence: [
                `Metric value: ${c.metricValue.toFixed(2)}`,
                `Volume share: ${c.volumeSharePct.toFixed(1)}%`,
                `Contribution: +${c.weightedContribution.toFixed(2)} pts`
            ],
            expectedImpact: `Potential +${(c.weightedContribution * 1.5).toFixed(2)} pts if replicated.`
        });
    }

    // Contradiction
    if (pack.contradictionDetected) {
        recs.push({
            action: "Reassess the analytical assumptions underlying this question",
            rationale: `The question assumes a ${pack.expectedDirection}, but ${pack.metricName} actually ${pack.metricChange?.direction}.`,
            supportingEvidence: [
                `Expected: ${pack.expectedDirection}`,
                `Actual: ${pack.metricChange?.direction} (${pack.metricChange?.absoluteChange?.toFixed(2)} pts)`
            ],
            expectedImpact: "Prevents misguided interventions based on incorrect assumptions."
        });
    }

    return recs.slice(0, 5);
}
