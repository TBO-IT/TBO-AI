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
    const ep = pack.executivePack;

    const implicationsText = ep.strategicImplications.map(i => `  • [${i.severity}] ${i.implication}`).join("\n");
    const actionsText = ep.topActions.map(a => `  • [${a.priority}] ${a.action}: ${a.rationale}`).join("\n");
    const oppsText = ep.topOpportunities.map(o => `  • [${o.severity}] ${o.title}: ${o.explanation}`).join("\n");
    const tradeoffsText = ep.tradeoffs.map(t => `  • ${t.title}: ${t.explanation}`).join("\n");
    const scenariosText = ep.scenarios.map(s => `  • [${s.type}]: ${s.description}`).join("\n");
    const impactsText = ep.actionImpacts.map(i => `  • ${i.action} (${i.confidence}): ${i.expectedImpact}`).join("\n");

    return `USER QUESTION: "${pack.question}"
METRIC: ${pack.metricName}
OVERALL CHANGE: ${pack.metricChange ? pack.metricChange.absoluteChange.toFixed(2) + ' points (' + pack.metricChange.direction + ')' : 'N/A'}
PERIOD: Prior → Current

EXECUTIVE SUMMARY: ${ep.executiveSummary}
LEADERSHIP MESSAGE: ${ep.leadershipMessage}
KEY TAKEAWAY: ${ep.keyTakeaway}

STRATEGIC IMPLICATIONS:
${implicationsText || "  • None identified."}

KEY TRADEOFFS:
${tradeoffsText || "  • None identified."}

RECOMMENDED ACTIONS TO PRIORITIZE:
${actionsText || "  • None identified."}

EXPECTED IMPACT:
${impactsText || "  • None identified."}

SCENARIO OUTLOOK:
${scenariosText || "  • None identified."}

KEY OPPORTUNITIES TO SCALE:
${oppsText || "  • None identified."}

CONFIDENCE ASSESSMENT:
${ep.confidenceAssessment.rationale}

TOTAL DATA POINTS: ${pack.totalRows}

Generate 3 strategic recommendations based ONLY on the data above.
Focus on action-oriented output, prioritizing the actions and strategic implications provided.
Format output strictly adhering to action-oriented structures.`;
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
        return buildDeterministicRecommendations(pack);
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
            return buildDeterministicRecommendations(pack);
        }

        return {
            recommendations,
            claudeUsed: true,
            claudeFailed: false
        };
    } catch (err: any) {
        console.error(`[RECOMMENDATION_ENGINE] Claude Sonnet failed (${err.code ?? "UNKNOWN"}) — using deterministic`);
        return buildDeterministicRecommendations(pack);
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

export function buildDeterministicRecommendations(pack: ClaudeInputPack): RecommendationResult {
    const recs: Recommendation[] = [];
    
    // Contradiction fallback
    if (pack.contradictionDetected) {
        recs.push({
            action: "Reassess the underlying assumptions of the question.",
            rationale: `The data shows ${pack.metricChange?.direction} instead of ${pack.expectedDirection}.`,
            supportingEvidence: ["Contradiction detected in expectation vs reality"],
            expectedImpact: "Align strategy with actual data."
        });
        return { recommendations: recs, claudeUsed: false, claudeFailed: true };
    }

    const actions = pack.executivePack.topActions.slice(0, 3);
    
    for (const a of actions) {
        recs.push({
            action: a.action,
            rationale: a.rationale,
            supportingEvidence: [`Priority: ${a.priority}`, `Entity: ${a.relatedEntity}`],
            expectedImpact: `Address strategic priority and mitigate/scale associated impact.`
        });
    }

    // Fallback if no actions generated
    if (recs.length === 0) {
        recs.push({
            action: "Monitor ongoing performance.",
            rationale: "No material drivers, risks, or opportunities identified.",
            supportingEvidence: [],
            expectedImpact: "Maintain current stability."
        });
    }

    return {
        recommendations: recs,
        claudeUsed: false,
        claudeFailed: true
    };
}
