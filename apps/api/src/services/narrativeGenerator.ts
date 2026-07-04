// ─── Narrative Generator ──────────────────────────────────────────────────────
//
// Transforms a ClaudeInputPack into an executive response using Claude Haiku.
//
// Exported functions:
//   buildNarrativePrompt(pack) → string
//   generateNarrative(pack)    → NarrativeResult
//
// Failover:
//   If Claude fails → return deterministic dashboard narrative.
//   The user's request NEVER fails.
// ───────────────────────────────────────────────────────────────────────────────

import { ClaudeInputPack, assertClaudeInputSafe } from "./claudeInputContract.js";
import { generateNarrativeText, generateNarrativeTextStream } from "./anthropicClient.js";
import { logger } from "../lib/logger.js";

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

DESIGN PRINCIPLE: Information Density > Word Count
Every line should communicate new information.
If a sentence repeats something already stated elsewhere: Delete it.
Every metric/value and every target should appear exactly once. No repetition.

RULES:
1. Use ONLY the facts provided in the user message.
2. NEVER invent numbers or entity names.
3. NEVER fabricate recommendations; use only the provided attributed targets.
4. If a contradiction is noted, explain it FIRST before any other analysis.
5. Dashboard-only writing: tables and bullets only (no paragraphs).
6. Every section answers exactly ONE business question.
7. No repeated metrics.
8. Never use abbreviations "pt", "pts", or "pp". Always use "percentage points" explicitly.
9. For flat metrics (0.00 change), write "[Metric Name] remained stable".
10. Enforce the EXACT response structure below. Do not add extra headings or change their order.
11. Reduce output tokens by increasing information density.`;

// ─── Public: buildNarrativePrompt ─────────────────────────────────────────────

/**
 * Builds the Claude prompt from a validated ClaudeInputPack.
 * This function is exported for testing and inspection.
 */
export function buildNarrativePrompt(pack: ClaudeInputPack): string {
    const ep = pack.executivePack;

    const risksText = ep.topRisks.slice(0, 3)
        .map(r => `  • [${r.severity}] ${r.title}: ${r.explanation}`)
        .join("\n");

    const oppsText = ep.topOpportunities.slice(0, 3)
        .map(o => `  • [${o.severity}] ${o.title}: ${o.explanation}`)
        .join("\n");

    const actionsText = ep.topActions.slice(0, 3)
        .map(a => `  • [${a.priority}] ${a.action}: ${a.rationale}`)
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

    // ── Executive Intelligence Context ──────────────────────────────────────
    const scenariosText = (ep.scenarios ?? []).map(s => `  • ${s.type}: ${s.description}`).join("\n");
    const tradeoffsText = (ep.tradeoffs ?? []).map(t => `  • ${t.title}: ${t.explanation}`).join("\n");
    const confidenceText = ep.confidenceAssessment ? `${ep.confidenceAssessment.confidence} - ${ep.confidenceAssessment.rationale}` : "N/A";

    const warnings = pack.validationErrors.length > 0
        ? `\nDATA QUALITY WARNINGS:\n${pack.validationErrors.map(e => `  ⚠ ${e}`).join("\n")}\n`
        : "";

    return `USER QUESTION: "${pack.question}"
METRIC: ${pack.metricName}
VALIDATION: ${pack.validationStatus}

OVERALL CHANGE: ${pack.metricChange ? pack.metricChange.absoluteChange.toFixed(2) + " percentage points (" + pack.metricChange.direction + ")" : "N/A"}

HEADLINE: ${ep.headline}
EXECUTIVE SUMMARY (legacy text): ${ep.executiveSummary}
KEY TAKEAWAY: ${ep.keyTakeaway}
LEADERSHIP MESSAGE (legacy): ${ep.leadershipMessage}

PRIMARY TARGET:
  • ${primaryTargetText}

TOP RISKS:
${risksText || "  • None identified."}

TOP OPPORTUNITIES:
${oppsText || "  • None identified."}

TOP DRIVERS (for Key Drivers table):
${ep.topDrivers.slice(0, 3).map(d => `  • ${d.name} | ${d.metricDelta} percentage points | vol=${d.volumeSharePct} | ${d.priorityRank}`).join("\n")}

RECOMMENDED ACTIONS (for Recommended Actions table):
${actionsText || "  • None identified."}

RECOMMENDATION TARGETS (for linkage):
${newActionsText || "  • None identified."}

SUPPORTING TARGETS (for Key Drivers rows):
${supportingTargetsText || "  • None identified."}

STRATEGIC CONTEXT:
  Confidence: ${confidenceText}

SCENARIOS:
${scenariosText || '  • None'}

TRADEOFFS TO CONSIDER:
${tradeoffsText || '  • None'}

TOTAL DATA POINTS: ${pack.totalRows}
${warnings}

WRITE the executive response following these rules:
- Output must match the EXACT structure and heading order below.
- Executive Decision: compact table with maximum 5 rows and no paragraphs.
- Recommended Actions: maximum 3 rows; table columns must be Priority | Action | Why | Expected Outcome.
- Key Drivers: markdown table with columns Driver | Impact | Volume | Priority.
- Key Risks: markdown table with columns Severity | Risk | Business Impact; maximum 3 rows.
- Leadership Notes: exactly three bullets; each bullet one sentence.
- No metric/value repetition across sections.
- Always name the metric explicitly and use "percentage points" (never "pt", "pts", or "pp").
- No extra headings and no narrative outside tables/bullets.

STRUCTURE (EXACT):
━━━━━━━━━━━━━━━━━━━━━━
## Executive Decision
| Decision | Value |
| ------------------ | ------------------------------- |
| Overall Status | [text] |
| Highest Priority | [entity/target] |
| Business Impact | [metric change in words] |
| Volume | [volume share in percent] |
| Recommended Action | [short directive] |

## Primary Target
| Target | Value |
|---|---|
| Metric | ${pack.metricName} |
| Target Name | [primary target name] |
| Business Impact | [business impact text] |
| Volume Share | [volume share] |
| Recommended Direction | [recover / de-risk / protect / scale text] |

## Recommended Actions
| Priority | Action | Why | Expected Outcome |
|---|---|---|---|
| P0 | [action] | [reason] | [outcome] |
| P1 | [action] | [reason] | [outcome] |
| P2 | [action] | [reason] | [outcome] |

## Key Drivers
| Driver | Impact | Volume | Priority |
|---|---|---|---|
| [driver] | [impact in words/percentage points] | [volume] | [priority] |

## Key Risks
| Severity | Risk | Business Impact |
|---|---|---|
| [severity] | [risk] | [impact in words] |

## Leadership Notes
• [one sentence]
• [one sentence]
• [one sentence]
━━━━━━━━━━━━━━━━━━━━━━`;
}

// ─── Public: generateNarrative ────────────────────────────────────────────────

/**
 * Generates an executive dashboard narrative from a validated ClaudeInputPack.
 * Calls Claude Haiku. Falls back to deterministic if Claude fails.
 */
export async function generateNarrative(pack: ClaudeInputPack): Promise<NarrativeResult> {
    logger.info({ question: pack.question.slice(0, 80), metricName: pack.metricName }, "Narrative generator entered");

    // 1. Safety gate
    try {
        assertClaudeInputSafe(pack);
        logger.info({ metricName: pack.metricName }, "Narrative generator safety gate passed");
    } catch (err) {
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
        logger.info(
            { chars: result.text.length, estimatedCost: result.estimatedCost, rawPreview: result.text.slice(0, 120) },
            "Narrative generator Claude returned"
        );
        return parsed;
    } catch (err: any) {
        logger.error({ err, code: err?.code ?? "UNKNOWN" }, "Narrative generator Claude failed; using deterministic fallback");
        const fallback = buildDeterministicNarrative(pack);
        fallback.claudeFailed = true;
        return fallback;
    }
}

/**
 * Streaming variant of generateNarrative.
 * - Streams tokens via `onToken`
 * - Still parses the final text for identical analytical output.
 */
export async function generateNarrativeStream(
    pack: ClaudeInputPack,
    opts: {
        onToken?: (chunk: string) => void;
        abortSignal?: AbortSignal;
    }
): Promise<NarrativeResult> {
    const onToken = opts.onToken ?? (() => {});
    logger.info({ question: pack.question.slice(0, 80), metricName: pack.metricName }, "Narrative generator entered (stream)");

    // 1. Safety gate
    try {
        assertClaudeInputSafe(pack);
        logger.info({ metricName: pack.metricName }, "Narrative generator safety gate passed");
    } catch (err) {
        logger.error({ err, metricName: pack.metricName }, "Narrative generator safety gate blocked");
        return buildDeterministicNarrative(pack);
    }

    // 2. Build prompt
    const prompt = buildNarrativePrompt(pack);
    logger.info({ chars: prompt.length }, "Narrative generator prompt built");

    // 3. Call Claude streaming
    logger.info({}, "Narrative generator calling Claude Haiku (stream)");
    try {
        const result = await generateNarrativeTextStream(
            prompt,
            SYSTEM_PROMPT,
            (chunk) => onToken(chunk),
            opts.abortSignal
        );

        const parsed = parseClaudeNarrative(result.text, pack);
        logger.info(
            { chars: result.text.length, estimatedCost: result.estimatedCost, rawPreview: result.text.slice(0, 120) },
            "Narrative generator Claude returned (stream accumulated)"
        );
        return parsed;
    } catch (err: any) {
        logger.error({ err, code: err?.code ?? "UNKNOWN" }, "Narrative generator Claude failed; using deterministic fallback");
        const fallback = buildDeterministicNarrative(pack);
        fallback.claudeFailed = true;
        return fallback;
    }
}

// ─── Deterministic Fallback ───────────────────────────────────────────────────

export function buildDeterministicNarrative(pack: ClaudeInputPack): NarrativeResult {
    const ep = pack.executivePack;

    const primary = ep.primaryTarget;

    const overallStatus = ep.topRisks.length > 0 ? "⚠ Hidden deterioration" : "✅ Stable performance";
    const highestPriority = primary?.name ?? (ep.topRisks[0]?.title ?? ep.topOpportunities[0]?.title ?? "N/A");

    const impactText = pack.metricChange
        ? `${pack.metricName} ${pack.metricChange.direction === "increase" ? "increased" : "decreased"} by ${Math.abs(pack.metricChange.absoluteChange).toFixed(2)} percentage points`
        : `${pack.metricName} remained stable`;


    const volumeText = primary?.volumeShare != null
        ? `${(primary.volumeShare * 100).toFixed(1)}%`
        : "N/A";


    const recommendedAction = ep.topActions[0]?.action
        ? ep.topActions[0].action
        : (ep.topRisks[0] ? `Mitigate ${ep.topRisks[0].affectedEntity} deterioration` : "Maintain current strategy");

    const decisionTable = [
        ["Overall Status", overallStatus],
        ["Highest Priority", highestPriority],
        ["Business Impact", impactText],
        ["Volume", volumeText],
        ["Recommended Action", recommendedAction]
    ];

    const primaryTargetTable = [
        ["Metric", pack.metricName],
        ["Target Name", primary?.name ?? "None identified"],
        ["Business Impact", primary?.reason ?? ep.keyTakeaway],
        ["Volume Share", primary?.volumeShare != null ? `${(primary.volumeShare * 100).toFixed(1)}%` : "N/A"],
        ["Recommended Direction", primary?.polarity === "POSITIVE" ? "recover" : primary?.polarity === "RISK" ? "de-risk" : "scale"]
    ];

    const recRows = (ep.topActions ?? []).slice(0, 3);
    const recActionsTable = recRows.length
        ? recRows.map((a: any) => [a.priority, a.action, a.rationale, "Execute the linked action to improve the business outcome"])
        : [["P0", "No action found", "Insufficient data", "Maintain current performance"]];


    const driverRows = (ep.topDrivers ?? []).slice(0, 3);

    const keyDriversTable = driverRows.map((d: any) => [
        d.name,
        `${d.metricDelta >= 0 ? "Increase" : "Decrease"} by ${Math.abs(d.metricDelta).toFixed(2)} percentage points`,
        d.volumeShare != null ? `${(d.volumeShare * 100).toFixed(1)}%` : "N/A",
        d.priority ?? "—"
    ]);

    const riskRows = (ep.topRisks ?? []).slice(0, 3);
    const keyRisksTable = riskRows.map((r: any) => [
        r.severity,
        r.title,
        r.explanation
    ]);

    const leadershipNotes = [
        ep.topActions[0]?.action ? `Execute: ${ep.topActions[0].action}.` : `Focus: ${ep.keyTakeaway}.`,
        ep.topRisks[0] ? `Address risk: ${ep.topRisks[0].title}.` : `Protect upside by monitoring top opportunities weekly.`,
        ep.topOpportunities[0] ? `Pursue opportunity: ${ep.topOpportunities[0].title}.` : `Maintain discipline on the primary target.`,
    ];

    const raw = [
        "━━━━━━━━━━━━━━━━━━━━━━",
        "## Executive Decision",
        "| Decision | Value |",
        "| ------------------ | ------------------------------- |",
        ...decisionTable.map(([k, v]) => `| ${k} | ${v} |`),
        "",
        "## Primary Target",
        "| Target | Value |",
        "|---|---|",
        ...primaryTargetTable.map(([k, v]) => `| ${k} | ${v} |`),
        "",
        "## Recommended Actions",
        "| Priority | Action | Why | Expected Outcome |",
        "|---|---|---|---|",
        ...recActionsTable.map(([p, act, why, out]) => `| ${p} | ${act} | ${why} | ${out} |`).slice(0, 3),
        "",
        "## Key Drivers",
        "| Driver | Impact | Volume | Priority |",
        "|---|---|---|---|",
        ...keyDriversTable.map((row) => `| ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} |`),
        "",
        "## Key Risks",
        "| Severity | Risk | Business Impact |",
        "|---|---|---|",
        ...keyRisksTable.map((row) => `| ${row[0]} | ${row[1]} | ${row[2]} |`).slice(0, 3),
        "",
        "## Leadership Notes",
        `• ${leadershipNotes[0]}`,
        `• ${leadershipNotes[1]}`,
        `• ${leadershipNotes[2]}`,
        "━━━━━━━━━━━━━━━━━━━━━━"
    ].join("\n");

    return {
        executiveSummary: ep.executiveSummary,
        keyDrivers: (ep.topDrivers ?? []).slice(0, 3).map((d: any) => d.name),
        risks: (ep.topRisks ?? []).slice(0, 3).map((r: any) => r.title),
        rawNarrative: raw,
        claudeUsed: false,
        claudeFailed: true,
        contradictionNote: pack.contradictionDetected
            ? `Expected: ${pack.expectedDirection}. Actual: ${pack.metricChange?.direction}.`
            : undefined
    };
}

// ─── Claude Response Parser ───────────────────────────────────────────────────

function parseClaudeNarrative(text: string, pack: ClaudeInputPack): NarrativeResult {
    const keyDrivers = extractSection(text, /##\s*Key Drivers/i);
    const risks = extractSection(text, /##\s*Key Risks/i);

    // Keep executiveSummary field as the raw text for UI/search (original behavior)
    const executiveSummary = text.split("\n")[0]?.trim() ? text : epSafeExecutiveSummary(pack);

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

function epSafeExecutiveSummary(pack: ClaudeInputPack): string {
    try {
        return pack.executivePack?.executiveSummary ?? "";
    } catch {
        return "";
    }
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
            if (trimmed === "") continue;
            if (/^##\s*/i.test(trimmed)) break;

            // For markdown tables, extract the first column value (best-effort)
            if (trimmed.startsWith("|")) {
                const cells = trimmed.split("|").map(c => c.trim()).filter(Boolean);
                if (cells.length >= 2) {
                    items.push(cells[0]);
                }
                continue;
            }

            if (!/^(Driver|Severity|Risk|Priority|---)/i.test(trimmed) && trimmed.length > 3) {
                items.push(trimmed.replace(/^[-•*]\s*/, ""));
            }
        }
    }

    return items.slice(0, 5);
}

