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
import { assertClaudeInputSafe } from "./claudeInputContract.js";
import { generateNarrativeText, generateNarrativeTextStream } from "./anthropicClient.js";
import { logger } from "../lib/logger.js";
const SYSTEM_PROMPT = `You are an elite Revenue Operator and Analytics Copilot for a travel industry executive.

DESIGN PRINCIPLE: Information Density > Word Count
Every line should communicate new information.
If a sentence repeats something already stated elsewhere: Delete it.
Every metric, recommendation, and conclusion should appear exactly once. No repetition.

RULES:
1. Use ONLY the facts provided in the user message.
2. NEVER invent numbers that are not in the data.
3. NEVER invent entity names that are not in the data.
4. NEVER fabricate recommendations — use the exact attributed targets provided.
5. If a contradiction is noted, explain it FIRST before any other analysis.
6. Use concise, direct, action-oriented business language. No fluff. Write for business executives, not analysts. Never assume readers understand statistical terminology.
7. NEVER use abbreviations "pt", "pts", or "pp". ALWAYS use "percentage points" explicitly or describe the metric change clearly (e.g., "Win Rate decreased by 9.73 percentage points").
8. Avoid words like "drag", "delta", "structural deterioration", "leveraging", "material downside", "optimization opportunity".
9. For flat metrics (0.00 change), DO NOT write "0.00 pts" or "0.00 percentage points". Instead write "Overall [Metric Name] appears unchanged" or "[Metric Name] remained stable."
10. Replace paragraphs with markdown tables where instructed.
11. Keep the total response dense, concise, and structured like a BI dashboard.`;
// ─── Public: buildNarrativePrompt ─────────────────────────────────────────────
/**
 * Builds the Claude prompt from a validated ClaudeInputPack.
 * This function is exported for testing and inspection.
 */
export function buildNarrativePrompt(pack) {
    const ep = pack.executivePack;
    // Formatting rules to enforce Actionability
    const rules = [
        "Write an action-oriented briefing for the CEO / CRO.",
        "You are the Revenue Operator.",
        "Rule 1: Always use the exact markdown structure provided.",
        "Rule 2: Never produce long paragraphs. Use short sentences, active voice, and strong verbs.",
        "Rule 3: Answer 'What should leadership know?' in the Executive Decision Brief in 1-2 sentences.",
        "Rule 4: Focus on business impact and actionable next steps.",
        "Rule 5: Never invent data or targets.",
        "Rule 6: Never use 'pt', 'pts', or 'pp'. Write 'percentage points' and always name the metric.",
        "Rule 7: Write for business executives. Avoid analyst shorthand.",
        "Rule 8: Reduce output tokens by increasing information density. Never repeat numerical values."
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

OVERALL CHANGE: ${pack.metricChange ? pack.metricChange.absoluteChange.toFixed(2) + ' percentage points (' + pack.metricChange.direction + ')' : 'N/A'}
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
━━━━━━━━━━━━━━━━━━━━━━
# Executive Decision Brief
[1-2 sentences immediately answering "What should leadership know?"]

━━━━━━━━━━━━━━━━━━━━━━
# Primary Target
| Metric | Value |
|---|---|
| Target | [Target Name] |
| Business Metric | [Metric Name] |
| Business Impact | [Metric Change] |
| Volume | [Volume/Share] |
| Expected ROI | [Expected Impact] |

━━━━━━━━━━━━━━━━━━━━━━
# Recommended Actions
[Max 3 actions. Format as:]
**[Title]**
*Why:* [Reason]
*Expected Outcome:* [Expected outcome]

━━━━━━━━━━━━━━━━━━━━━━
# Key Drivers
| Driver | Impact | Volume | Priority |
|---|---|---|---|
[Populate with supporting targets and opportunities. No narrative paragraph.]

━━━━━━━━━━━━━━━━━━━━━━
# Key Risks
[Max 3 bullets. One sentence each.]

━━━━━━━━━━━━━━━━━━━━━━
# Executive Summary
[Max 60-80 words. Summarize what happened, why, and what leadership should do next.]
ONLY the facts above. Do NOT invent data.`;
}
// ─── Public: generateNarrative ────────────────────────────────────────────────
/**
 * Generates an executive narrative from a validated ClaudeInputPack.
 *
 * Calls Claude Haiku. Falls back to deterministic if Claude fails.
 */
export async function generateNarrative(pack) {
    logger.info({ question: pack.question.slice(0, 80), metricName: pack.metricName }, "Narrative generator entered");
    // 1. Safety gate
    try {
        assertClaudeInputSafe(pack);
        logger.info({ metricName: pack.metricName }, "Narrative generator safety gate passed");
    }
    catch (err) {
        logger.error({ err, metricName: pack.metricName }, "Narrative generator safety gate blocked");
        return buildDeterministicNarrative(pack);
    }
    // 2. Build prompt
    const prompt = buildNarrativePrompt(pack);
    logger.info({ chars: prompt.length }, "Narrative generator prompt built");
    // 3. Call Claude
    logger.info({}, "Narrative generator calling Claude Haiku");
    try {
        const result = await generateNarrativeText(prompt, SYSTEM_PROMPT);
        const parsed = parseClaudeNarrative(result.text, pack);
        logger.info({ chars: result.text.length, estimatedCost: result.estimatedCost, rawPreview: result.text.slice(0, 120) }, "Narrative generator Claude returned");
        return parsed;
    }
    catch (err) {
        logger.error({ err, code: err.code ?? "UNKNOWN" }, "Narrative generator Claude failed; using deterministic fallback");
        const fallback = buildDeterministicNarrative(pack);
        fallback.claudeFailed = true;
        return fallback;
    }
}
/**
 * Streaming variant of generateNarrative.
 * - Streams natural text chunks to `onToken`
 * - Still accumulates the full text and parses it using the existing parser
 *   to preserve identical analytical output.
 */
export async function generateNarrativeStream(pack, opts) {
    const onToken = opts.onToken ?? (() => { });
    logger.info({ question: pack.question.slice(0, 80), metricName: pack.metricName }, "Narrative generator entered (stream)");
    // 1. Safety gate
    try {
        assertClaudeInputSafe(pack);
        logger.info({ metricName: pack.metricName }, "Narrative generator safety gate passed");
    }
    catch (err) {
        logger.error({ err, metricName: pack.metricName }, "Narrative generator safety gate blocked");
        return buildDeterministicNarrative(pack);
    }
    // 2. Build prompt
    const prompt = buildNarrativePrompt(pack);
    logger.info({ chars: prompt.length }, "Narrative generator prompt built");
    // 3. Call Claude streaming
    logger.info({}, "Narrative generator calling Claude Haiku (stream)");
    try {
        const result = await generateNarrativeTextStream(prompt, SYSTEM_PROMPT, (chunk) => onToken(chunk), opts.abortSignal);
        const parsed = parseClaudeNarrative(result.text, pack);
        logger.info({ chars: result.text.length, estimatedCost: result.estimatedCost, rawPreview: result.text.slice(0, 120) }, "Narrative generator Claude returned (stream accumulated)");
        return parsed;
    }
    catch (err) {
        logger.error({ err, code: err.code ?? "UNKNOWN" }, "Narrative generator Claude failed; using deterministic fallback");
        const fallback = buildDeterministicNarrative(pack);
        fallback.claudeFailed = true;
        return fallback;
    }
}
// ─── Deterministic Fallback ───────────────────────────────────────────────────
export function buildDeterministicNarrative(pack) {
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
function parseClaudeNarrative(text, pack) {
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
function extractSection(text, headerPattern) {
    const lines = text.split("\n");
    const items = [];
    let capturing = false;
    for (const line of lines) {
        if (headerPattern.test(line)) {
            capturing = true;
            continue;
        }
        if (capturing) {
            const trimmed = line.trim();
            if (trimmed === "" || /^(executive|summary|recommendation|conclusion)/i.test(trimmed)) {
                if (items.length > 0)
                    break;
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
