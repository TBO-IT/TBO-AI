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
    `You are an Executive Analytics Copilot writing a C-suite briefing memo for a travel industry executive.

RULES:
1. Use ONLY the facts provided in the user message.
2. NEVER invent numbers that are not in the data.
3. NEVER invent entity names that are not in the data.
4. NEVER fabricate recommendations — just explain the findings.
5. If a contradiction is noted, explain it FIRST before any other analysis.
6. Use concise, executive business language. No technical jargon.
7. Never reference SQL, databases, queries, DuckDB, or technical infrastructure.
8. Structure: Executive Summary -> Key Takeaway -> Top Risks -> Top Opportunities -> Key Tradeoffs -> Recommended Actions -> Expected Impact -> Scenario Outlook -> Confidence Assessment -> Leadership Message.
9. Keep the total response under 800 words.`;

// ─── Public: buildNarrativePrompt ─────────────────────────────────────────────

/**
 * Builds the Claude prompt from a validated ClaudeInputPack.
 * This function is exported for testing and inspection.
 */
export function buildNarrativePrompt(pack: ClaudeInputPack): string {
    const ep = pack.executivePack;

    // Formatting rules to enforce V3 quality
    const rules = [
        "Write an executive briefing intended for the CEO / CRO / Commercial Leadership.",
        "You are the VP of Revenue Strategy.",
        "Do not repeat metrics unnecessarily.",
        "Focus on business significance and prioritize material findings.",
        "Explain why leadership should care.",
        "Surface tradeoffs, future risks, and growth opportunities explicitly.",
        "Explicitly reference recommended actions, expected impacts, and scenarios.",
        "Rule 1: Answer 'What happened?' within the first paragraph.",
        "Rule 2: Answer 'Why does it matter?' within the second paragraph.",
        "Rule 3: Answer 'What should leadership do?' before ending.",
        "Rule 4: Never list more than 3 Risks, 3 Opportunities, 3 Tradeoffs, or 3 Actions.",
        "Rule 5: Always identify the single most important insight."
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

    const impactsText = ep.actionImpacts.slice(0, 3)
        .map(i => `  • ${i.action} (${i.confidence} confidence): ${i.expectedImpact}`)
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

TOP RISKS:
${risksText || "  • None identified."}

TOP OPPORTUNITIES:
${oppsText || "  • None identified."}

KEY TRADEOFFS:
${tradeoffsText || "  • None identified."}

RECOMMENDED ACTIONS:
${actionsText || "  • None identified."}

EXPECTED IMPACT:
${impactsText || "  • None identified."}

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
EXECUTIVE SUMMARY
[text]

KEY TAKEAWAY
[text]

TOP RISKS
[text]

TOP OPPORTUNITIES
[text]

KEY TRADEOFFS
[text]

RECOMMENDED ACTIONS
[text]

EXPECTED IMPACT
[text]

SCENARIO OUTLOOK
[text]

CONFIDENCE ASSESSMENT
[text]

LEADERSHIP MESSAGE
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

    let raw = `EXECUTIVE SUMMARY\n${ep.headline} ${ep.executiveSummary}\n\n`;
    raw += `KEY TAKEAWAY\n${ep.keyTakeaway}\n\n`;
    raw += `TOP RISKS\n${risks || "  • None identified"}\n\n`;
    raw += `TOP OPPORTUNITIES\n${opps || "  • None identified"}\n\n`;
    raw += `KEY TRADEOFFS\n${tradeoffs || "  • None identified"}\n\n`;
    raw += `RECOMMENDED ACTIONS\n${actions || "  • None identified"}\n\n`;
    raw += `EXPECTED IMPACT\n${impacts || "  • None identified"}\n\n`;
    raw += `SCENARIO OUTLOOK\n${scenarios || "  • None identified"}\n\n`;
    raw += `CONFIDENCE ASSESSMENT\n${ep.confidenceAssessment.rationale}\n\n`;
    raw += `LEADERSHIP MESSAGE\n${ep.leadershipMessage}\n`;

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