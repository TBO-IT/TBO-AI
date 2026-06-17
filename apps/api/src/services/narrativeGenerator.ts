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

// ─── System Prompt ────────────────────────────────────────────────────────────

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
8. Structure: Executive Summary → Key Drivers → Risks.
9. Keep the total response under 400 words.`;

// ─── Public: buildNarrativePrompt ─────────────────────────────────────────────

/**
 * Builds the Claude prompt from a validated ClaudeInputPack.
 * This function is exported for testing and inspection.
 */
export function buildNarrativePrompt(pack: ClaudeInputPack): string {
    const lines: string[] = [];

    lines.push(`USER QUESTION: "${pack.question}"`);
    lines.push(`METRIC: ${pack.metricName}`);
    lines.push(`VALIDATION: ${pack.validationStatus}`);

    // Contradiction — must come first
    if (pack.contradictionDetected) {
        lines.push("");
        lines.push(`CONTRADICTION ALERT:`);
        lines.push(`The user's question assumes a "${pack.expectedDirection}" in ${pack.metricName}.`);
        lines.push(`However, the data shows the metric actually ${pack.metricChange?.direction === "increase" ? "increased" : "declined"} by ${Math.abs(pack.metricChange?.absoluteChange ?? 0).toFixed(2)} points.`);
        lines.push(`You MUST address this contradiction FIRST in your response.`);
    }

    // Metric change
    if (pack.metricChange) {
        lines.push("");
        lines.push(`OVERALL CHANGE: ${pack.metricChange.absoluteChange > 0 ? "+" : ""}${pack.metricChange.absoluteChange.toFixed(2)} points (${pack.metricChange.direction})`);
        lines.push(`PERIOD: ${pack.metricChange.priorPeriod} → ${pack.metricChange.currentPeriod}`);
        if (pack.metricChange.relativeChangePct !== 0) {
            lines.push(`RELATIVE: ${pack.metricChange.relativeChangePct > 0 ? "+" : ""}${pack.metricChange.relativeChangePct.toFixed(1)}%`);
        }
    }

    // Positive contributors
    if (pack.topPositiveContributors.length > 0) {
        lines.push("");
        lines.push("TOP POSITIVE CONTRIBUTORS:");
        for (const c of pack.topPositiveContributors.slice(0, 5)) {
            lines.push(`  • ${c.name}: +${c.weightedContribution.toFixed(2)} pts (${c.contributionPct.toFixed(1)}% of total change), ${c.volumeSharePct.toFixed(1)}% volume share`);
        }
    }

    // Negative contributors
    if (pack.topNegativeContributors.length > 0) {
        lines.push("");
        lines.push("TOP NEGATIVE CONTRIBUTORS:");
        for (const c of pack.topNegativeContributors.slice(0, 5)) {
            lines.push(`  • ${c.name}: ${c.weightedContribution.toFixed(2)} pts (${c.contributionPct.toFixed(1)}% of total change), ${c.volumeSharePct.toFixed(1)}% volume share`);
        }
    }

    // Dimension counts
    const dims: string[] = [];
    if (pack.affectedHotels.length > 0) dims.push(`${pack.affectedHotels.length} hotels`);
    if (pack.affectedChains.length > 0) dims.push(`${pack.affectedChains.length} chains`);
    if (pack.affectedSuppliers.length > 0) dims.push(`${pack.affectedSuppliers.length} suppliers`);
    if (pack.affectedAPWBuckets.length > 0) dims.push(`${pack.affectedAPWBuckets.length} APW buckets`);
    if (dims.length > 0) {
        lines.push("");
        lines.push(`DIMENSIONS ANALYZED: ${dims.join(", ")}`);
    }

    lines.push(`TOTAL DATA POINTS: ${pack.totalRows}`);

    // Validation errors
    if (pack.validationErrors.length > 0) {
        lines.push("");
        lines.push("DATA QUALITY WARNINGS:");
        for (const e of pack.validationErrors) {
            lines.push(`  ⚠ ${e}`);
        }
    }

    lines.push("");
    lines.push("Write an executive briefing with: Executive Summary, Key Drivers, and Risks.");
    lines.push("Use ONLY the facts above. Do NOT invent data.");

    return lines.join("\n");
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

function buildDeterministicNarrative(pack: ClaudeInputPack): NarrativeResult {
    const keyDrivers: string[] = [];
    const risks: string[] = [];

    // Contradiction
    if (pack.contradictionDetected) {
        const summary =
            `The question assumes a ${pack.expectedDirection} in ${pack.metricName}.\n\n` +
            `However, the data shows ${pack.metricName} actually ` +
            `${pack.metricChange?.direction === "increase" ? "increased" : "declined"} ` +
            `by ${Math.abs(pack.metricChange?.absoluteChange ?? 0).toFixed(2)} points.`;

        return {
            executiveSummary: summary,
            keyDrivers: [],
            risks: ["The assumption in the question does not match the data."],
            rawNarrative: summary,
            contradictionNote: `Expected: ${pack.expectedDirection}. Actual: ${pack.metricChange?.direction}.`,
            claudeUsed: false,
            claudeFailed: false
        };
    }

    // Summary
    let summary = "";
    if (pack.metricChange) {
        const dir = pack.metricChange.direction;
        const abs = Math.abs(pack.metricChange.absoluteChange).toFixed(2);
        summary = `${pack.metricName} ${dir === "increase" ? "improved" : dir === "decline" ? "declined" : "remained flat"} by ${abs} points from ${pack.metricChange.priorPeriod} to ${pack.metricChange.currentPeriod}.`;
    } else {
        summary = `Analysis of ${pack.metricName} across ${pack.totalRows} data points.`;
    }

    // Drivers
    for (const c of pack.topPositiveContributors.slice(0, 5)) {
        keyDrivers.push(`${c.name}: +${c.weightedContribution.toFixed(2)} pts (${c.contributionPct.toFixed(1)}% of change), ${c.volumeSharePct.toFixed(1)}% volume`);
    }

    // Risks
    for (const c of pack.topNegativeContributors.slice(0, 5)) {
        risks.push(`${c.name}: ${c.weightedContribution.toFixed(2)} pts (${c.contributionPct.toFixed(1)}% of change), ${c.volumeSharePct.toFixed(1)}% volume`);
    }

    const rawNarrative =
        summary +
        (keyDrivers.length > 0 ? `\n\nKey Drivers:\n${keyDrivers.map(d => `• ${d}`).join("\n")}` : "") +
        (risks.length > 0 ? `\n\nRisks:\n${risks.map(r => `• ${r}`).join("\n")}` : "");

    return {
        executiveSummary: summary,
        keyDrivers,
        risks,
        rawNarrative,
        claudeUsed: false,
        claudeFailed: false
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