// ─── Narrative Generator ──────────────────────────────────────────────────────
//
// Transforms a ClaudeInputPack into an executive narrative using Claude Haiku.
//
// Exported functions:
//   buildNarrativePrompt(pack) → string
//   generateNarrative(pack)    → NarrativeResult
//
// Prompt rules:
//   1. Use ONLY facts provided in the pack.
//   2. Never invent numbers.
//   3. Never invent entities.
//   4. Never fabricate recommendations (that's recommendationGenerator's job).
//   5. If contradictionDetected=true: explain contradiction FIRST.
//   6. Executive business tone.
//
// Failover:
//   If Claude fails → return deterministic narrative.
//   The user's request NEVER fails.
// ───────────────────────────────────────────────────────────────────────────────

import { ClaudeInputPack, assertClaudeInputSafe } from "./claudeInputContract.js";
import { generateNarrativeText, AnthropicClientError } from "./anthropicClient.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NarrativeResult {
    executiveSummary: string;
    keyDrivers: string[];
    risks: string[];
    rawNarrative: string;
    contradictionNote?: string;
    claudeUsed: boolean;
    claudeFailed: boolean;
}

const SYSTEM_PROMPT =
    `You are an elite Revenue Operator and Analytics Copilot for a travel industry executive.

RULES:
1. Use ONLY the facts provided in the user message.
2. NEVER invent numbers that are not in the data.
3. NEVER invent entity names that are not in the data.
4. NEVER fabricate recommendations — use the exact attributed targets provided.
5. If a contradiction is noted, explain it FIRST before any other analysis.
6. Use concise, direct, action-oriented business language. No fluff.
7. Structure: PRIMARY TARGET -> SUPPORTING TARGETS -> RECOMMENDED ACTIONS -> EXECUTIVE SUMMARY -> KEY TAKEAWAY -> TOP RISKS -> TOP OPPORTUNITIES -> SCENARIO OUTLOOK.
8. Keep the total response under 800 words.`;

// ─── Public: buildNarrativePrompt ─────────────────────────────────────────────

/**
 * Builds the Claude prompt from a validated ClaudeInputPack.
 * This function is exported for testing and inspection.
 */
export function buildNarrativePrompt(pack: ClaudeInputPack): string {
    const ep = pack.executivePack;

    // Formatting rules to enforce Actionability
    const rules = [
        "Write an action-oriented briefing for the CEO / CRO.",
        "You are the Revenue Operator.",
        "Rule 1: Always list the PRIMARY TARGET and SUPPORTING TARGETS first.",
        "Rule 2: List the RECOMMENDED ACTIONS immediately after the targets.",
        "Rule 3: Answer 'What happened?' in the EXECUTIVE SUMMARY.",
        "Rule 4: Focus on business impact and actionable next steps.",
        "Rule 5: Never invent data or targets."
    ].join("\n");

    const risksText = ep.topRisks.slice(0, 3)
        .map(r => `  • [${r.severity}] ${r.title}: ${r.explanation}`)
        .join("\n");

    const oppsText = ep.topOpportunities.slice(0, 3)
        .map(o => `  • [${o.severity}] ${o.title}: ${o.explanation}`)
        .join("\n");

    const actionsText = ep.topActions.slice(0, 3)
        .map(a => `  • [${a.priority}] ${a.action}: ${a.rationale}`)
        .join("\n");

    const implicationsText = ep.strategicImplications.slice(0, 3)
        .map(i => `  • [${i.severity}] ${i.implication}`)
        .join("\n");

    const tradeoffsText = ep.tradeoffs.slice(0, 3)
        .map(t => `  • ${t.title}: ${t.explanation}`)
        .join("\n");

    const scenariosText = ep.scenarios
        .map(s => `  • [${s.type}]: ${s.description}`)
        .join("\n");

    const primaryTargetText = ep.primaryTarget 
        ? `${ep.primaryTarget.name} (${ep.primaryTarget.entityType}): ${ep.primaryTarget.reason}`
        : "None identified.";

    const supportingTargetsText = ep.drilldowns.slice(0, 3)
        .map(d => `  • ${d.name} (${d.entityType}): ${d.reason}`)
        .join("\n");

    const newActionsText = ep.recommendations.slice(0, 3)
        .map(r => `  • ${r.targetName}: ${r.expectedImpact}`)
        .join("\n");

    const warnings = pack.validationErrors.length > 0 
        ? `\nDATA QUALITY WARNINGS:\n${pack.validationErrors.map(e => `  ⚠ ${e}`).join("\n")}\n` 
        : "";

    return `USER QUESTION: "${pack.question}"
METRIC: ${pack.metricName}
VALIDATION: ${pack.validationStatus}

OVERALL CHANGE: ${pack.metricChange ? pack.metricChange.absoluteChange.toFixed(2) + ' points (' + pack.metricChange.direction + ')' : 'N/A'}
PERIOD: Prior → Current

HEADLINE: ${ep.headline}
EXECUTIVE SUMMARY: ${ep.executiveSummary}
KEY TAKEAWAY: ${ep.keyTakeaway}

PRIMARY TARGET:
  • ${primaryTargetText}

SUPPORTING TARGETS:
${supportingTargetsText || "  • None identified."}

TOP RISKS:
${risksText || "  • None identified."}

TOP OPPORTUNITIES:
${oppsText || "  • None identified."}

RECOMMENDED ACTIONS:
${newActionsText || "  • None identified."}

SCENARIO OUTLOOK:
${scenariosText || "  • None identified."}

STRATEGIC IMPLICATIONS:
${implicationsText || "  • None identified."}

CONFIDENCE ASSESSMENT:
${ep.confidenceAssessment.rationale}

LEADERSHIP MESSAGE: ${ep.leadershipMessage}
TOTAL DATA POINTS: ${pack.totalRows}
${warnings}
Write the executive briefing following these rules:
${rules}

Structure the output EXACTLY like this:
PRIMARY TARGET
[text]

SUPPORTING TARGETS
[text]

RECOMMENDED ACTIONS
[text]

EXECUTIVE SUMMARY
[text]

KEY TAKEAWAY
[text]

TOP RISKS
[text]

TOP OPPORTUNITIES
[text]

SCENARIO OUTLOOK
[text]

Use ONLY the facts above. Do NOT invent data.`;
}

// ─── Public: generateNarrative ────────────────────────────────────────────────

/**
 * Generates an executive narrative from a validated ClaudeInputPack.
 *
 * Calls Claude Haiku. Falls back to deterministic if Claude fails.
 */
export async function generateNarrative(pack: ClaudeInputPack): Promise<NarrativeResult> {
    console.log(`[NARRATIVE_GENERATOR] ENTERED | question="${pack.question.slice(0, 80)}" | metric=${pack.metricName}`);

    // 1. Safety gate
    try {
        assertClaudeInputSafe(pack);
        console.log(`[NARRATIVE_GENERATOR] Safety gate PASSED`);
    } catch (err) {
        console.error("[NARRATIVE_GENERATOR] Safety gate BLOCKED:", err);
        return buildDeterministicNarrative(pack);
    }

    // 2. Build prompt
    const prompt = buildNarrativePrompt(pack);
    console.log(`[NARRATIVE_GENERATOR] Prompt built | chars=${prompt.length}`);

    // 3. Call Claude
    console.log(`[NARRATIVE_GENERATOR] CALLING_CLAUDE_HAIKU...`);
    try {
        const result = await generateNarrativeText(prompt, SYSTEM_PROMPT);
        const parsed = parseClaudeNarrative(result.text, pack);

        console.log(
            `[NARRATIVE_GENERATOR] CLAUDE_RETURNED | ` +
            `chars=${result.text.length} | cost=$${result.estimatedCost.toFixed(4)} | ` +
            `rawPreview="${result.text.slice(0, 120)}"`
        );

        return parsed;
    } catch (err: any) {
        console.error(`[NARRATIVE_GENERATOR] CLAUDE_FAILED (${err.code ?? "UNKNOWN"}) — using deterministic fallback`);
        const fallback = buildDeterministicNarrative(pack);
        fallback.claudeFailed = true;
        return fallback;
    }
}

// ─── Deterministic Fallback ───────────────────────────────────────────────────

export function buildDeterministicNarrative(pack: ClaudeInputPack): NarrativeResult {
    const ep = pack.executivePack;

    const risks = ep.topRisks.map(r => `  • [${r.severity}] ${r.title}`).join("\n");
    const opps = ep.topOpportunities.map(o => `  • [${o.severity}] ${o.title}`).join("\n");
    const actions = ep.topActions.map(a => `  • [${a.priority}] ${a.action}`).join("\n");
    const implications = ep.strategicImplications.map(i => `  • [${i.severity}] ${i.implication}`).join("\n");
    const tradeoffs = ep.tradeoffs.map(t => `  • ${t.title}`).join("\n");
    const scenarios = ep.scenarios.map(s => `  • [${s.type}] ${s.description}`).join("\n");
    const impacts = ep.actionImpacts.map(i => `  • ${i.action}: ${i.expectedImpact}`).join("\n");

    const primaryTarget = ep.primaryTarget ? `  • ${ep.primaryTarget.name} (${ep.primaryTarget.entityType}): ${ep.primaryTarget.reason}` : "  • None identified";
    const supportingTargets = ep.drilldowns.map(d => `  • ${d.name} (${d.entityType}): ${d.reason}`).join("\n");
    const newActions = ep.recommendations.map(r => `  • ${r.targetName}: ${r.expectedImpact}`).join("\n");

    let raw = `PRIMARY TARGET\n${primaryTarget}\n\n`;
    raw += `SUPPORTING TARGETS\n${supportingTargets || "  • None identified"}\n\n`;
    raw += `RECOMMENDED ACTIONS\n${newActions || "  • None identified"}\n\n`;
    raw += `EXECUTIVE SUMMARY\n${ep.headline} ${ep.executiveSummary}\n\n`;
    raw += `KEY TAKEAWAY\n${ep.keyTakeaway}\n\n`;
    raw += `TOP RISKS\n${risks || "  • None identified"}\n\n`;
    raw += `TOP OPPORTUNITIES\n${opps || "  • None identified"}\n\n`;
    raw += `SCENARIO OUTLOOK\n${scenarios || "  • None identified"}\n`;

    return {
        executiveSummary: ep.executiveSummary,
        keyDrivers: ep.topDrivers.map(d => d.name),
        risks: ep.topRisks.map(r => r.title),
        rawNarrative: raw,
        claudeUsed: false,
        claudeFailed: true,
        contradictionNote: pack.contradictionDetected
            ? "Note: The user's expected direction contradicts the actual data."
            : undefined
    };
}

// ─── Claude Response Parser ───────────────────────────────────────────────────

function parseClaudeNarrative(text: string, pack: ClaudeInputPack): NarrativeResult {
    // Extract key drivers from text (lines after "Key Drivers" heading)
    const keyDrivers = extractSection(text, /key\s*drivers?/i);
    const risks = extractSection(text, /risks?/i);

    // The full text IS the executive summary from Claude
    const execSummaryMatch = text.match(/executive\s*summary[:\s]*([\s\S]*?)(?=\n\s*(?:key|risk|\n\n|$))/i);
    const executiveSummary = execSummaryMatch?.[1]?.trim() ?? text.split("\n\n")[0] ?? text;

    return {
        executiveSummary,
        keyDrivers,
        risks,
        rawNarrative: text,
        contradictionNote: pack.contradictionDetected
            ? `Expected: ${pack.expectedDirection}. Actual: ${pack.metricChange?.direction}.`
            : undefined,
        claudeUsed: true,
        claudeFailed: false
    };
}

function extractSection(text: string, headerPattern: RegExp): string[] {
    const lines = text.split("\n");
    const items: string[] = [];
    let capturing = false;

    for (const line of lines) {
        if (headerPattern.test(line)) {
            capturing = true;
            continue;
        }
        if (capturing) {
            const trimmed = line.trim();
            if (trimmed === "" || /^(executive|summary|recommendation|conclusion)/i.test(trimmed)) {
                if (items.length > 0) break;
                continue;
            }
            const cleaned = trimmed.replace(/^[-•*]\s*/, "").replace(/^\d+\.\s*/, "");
            if (cleaned.length > 5) {
                items.push(cleaned);
            }
        }
    }
    return items;
}