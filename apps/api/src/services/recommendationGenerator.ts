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

export const SYSTEM_PROMPT = `You are a Chief Revenue Officer (CRO) of a global travel technology company.
Your role is to transition raw analytics into high-leverage Decision Intelligence.

CORE DIRECTIVE:
You must answer: "What should leadership focus on?"
Do not act like a junior analyst summarizing data.
Act like an executive prioritizing the highest ROI actions.

RULES:
1. Always prioritize VULNERABILITIES (negative contributors) and competitive gaps.
2. If asked what to fix or how to compete, do NOT recommend scaling strengths.
3. Be direct, authoritative, and action-oriented.
4. Recommendations MUST be linked to the explicitly provided TARGETS.

TARGET-FIRST RESPONSE FORMAT:
Your response MUST exactly follow this structure:

PRIMARY TARGET
Entity: [Target Name]
Reason: [Why we are focusing on this]
Business Impact: [Metric Delta]
Expected ROI: [Expected Impact text]

RECOMMENDED ACTIONS
[Action 1 derived from Drilldowns]
[Action 2 derived from Drilldowns]
...

DRIVERS (Supporting Evidence)
[Brief summary of other drivers]

RISKS
[Brief summary of risks]

NARRATIVE
[2-3 sentences of executive narrative summarizing the strategy]`;

// ─── Public: buildRecommendationPrompt ────────────────────────────────────────

/**
 * Builds the Claude prompt. Exported for testing.
 */
export function buildRecommendationPrompt(pack: ClaudeInputPack): string {
    const ep = pack.executivePack;

    // Phase 5 Enforcement: Prioritize V4 Targets
    const competitiveGapsText = (ep.competitiveGaps ?? []).map(g => `  • Target: ${g.dimension} | Gap: ${g.gap.toFixed(2)} | Action: ${g.recommendation}`).join("\n");
    const v4RecommendationsText = (ep.recommendations ?? []).map(r => `  • [${r.targetType}] ${r.targetName}: ${r.expectedImpact}`).join("\n");
    const actionabilityTargetsText = (ep.actionabilityTargets ?? []).map(t => `  • [${t.entityType}] ${t.name}: ${t.reason}`).join("\n");
    
    const primaryTargetText = ep.primaryTarget 
        ? `${ep.primaryTarget.name} (${ep.primaryTarget.entityType}): ${ep.primaryTarget.reason}`
        : "None identified.";

    const supportingTargetsText = (ep.drilldowns ?? []).map(d => `  • ${d.name} (${d.entityType}): ${d.reason}`).join("\n");
    
    // Supporting Evidence (Legacy/Raw Context)
    const risksText = (ep.topRisks ?? []).map(r => `  • ${r.title}: ${r.description}`).join("\n");
    const oppsText = (ep.topOpportunities ?? []).map(o => `  • ${o.title}: ${o.description}`).join("\n");
    const driversText = (ep.topDrivers ?? []).map(d => `  • ${d.dimension}: ${d.contributor} (${d.metricDelta} pts)`).join("\n");

    return `USER QUESTION: "${pack.question}"
METRIC: ${pack.metricName}
OVERALL CHANGE: ${pack.metricChange ? pack.metricChange.absoluteChange.toFixed(2) + ' points (' + pack.metricChange.direction + ')' : 'N/A'}

PRIORITY 1: PRIMARY TARGET
  • ${primaryTargetText}

PRIORITY 2: RECOMMENDATION TARGETS
${v4RecommendationsText || "  • None identified."}
${competitiveGapsText ? "\nCOMPETITIVE GAPS (Treat as Recommendation Targets):\n" + competitiveGapsText : ""}

PRIORITY 3: ACTIONABILITY TARGETS
${actionabilityTargetsText || "  • None identified."}

PRIORITY 4: DRILLDOWN INSIGHTS
${supportingTargetsText || "  • None identified."}

SUPPORTING EVIDENCE (Do NOT generate recommendations directly from these unless explicitly linked to Priority 1-4 targets):
RISKS:
${risksText || "  • None"}
OPPORTUNITIES:
${oppsText || "  • None"}
TOP DRIVERS:
${driversText || "  • None"}

TOTAL DATA POINTS: ${pack.totalRows}

Generate 3 strategic recommendations based ONLY on the data above.
Focus on action-oriented output, prioritizing the explicitly provided TARGETS AND GAPS.
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

    // Fallback using V4 recommendations first
    const v4Actions = (pack.executivePack.recommendations ?? []).slice(0, 3);
    
    if (v4Actions.length > 0) {
        for (const a of v4Actions) {
            recs.push({
                action: a.expectedImpact, // using expectedImpact as action proxy for deterministic
                rationale: a.reason,
                supportingEvidence: [`Target: ${a.targetName}`, `Type: ${a.targetType}`],
                expectedImpact: a.expectedImpact
            });
        }
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
