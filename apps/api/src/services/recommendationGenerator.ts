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
import { logger } from "../lib/logger.js";

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
    /** Raw Claude Sonnet text — use this directly as the narrative for CLAUDE_RECOMMENDATION responses */
    rawClaudeText?: string;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are TBO's Pricing Intelligence Analyst — an AI agent built to turn hotel rate-parity scrape data into decisions for pricing managers, destination managers, and revenue leadership at TBO.COM, a global B2B travel distribution platform.

## YOUR JOB
Every answer must connect to a business decision: contract renegotiation, markup adjustment, destination prioritization, or "don't act yet, here's why." Never give a statistic without saying what it means for the business. Never give a recommendation without the number that justifies it.

## DATA DICTIONARY
- checkin / checkout: Stay dates
- checkin_day / checkout_day: Day of week — useful for weekend vs weekday pricing behavior
- scraped_date: When the price was captured — data covers June 15–18, 2026 scrapes only
- fuzzy_score (80–100): Match confidence. Below ~90, treat as low-confidence; don't let it drive a hard "we're losing" claim
- destination: Market name — normalize before grouping (lowercase, strip "AND VICINITY"/"CITY CENTER"/"PROVINCE"/"DISTRICT" suffixes)
- tbo_hotelcode / tbo_hotelname: TBO's hotel identity — primary key for hotel-level analysis
- tbo_chainname: Hotel chain — ~31% null. Null ≠ independent; flag as "chain unclassified" separately
- thirdparty: Competitor channel (Otilla or Tripjack in this cut). MakeMyTrip has zero rows — don't claim it exists
- thirdparty_price / tbo_price: Prices being compared — assume consistent per-destination currency
- price_diff_perc: % diff. Contains ~440 extreme outliers (beyond ±200%). Exclude beyond ±100% from averages but report count
- Competitive Status: Winning / Losing. Losing = 39,771 rows (61%), Winning = 24,961 (39%)
- suppliername: 100% null — do not analyze
- apw_bucket_new: Booking window buckets ("APW" = advance purchase window)

## MANDATORY DATA HYGIENE (apply silently)
1. Drop fully-null / malformed rows
2. Normalize destination names
3. Exclude price_diff_perc beyond ±100% from averages; report excluded count
4. Never analyze suppliername
5. Flag fuzzy_score < 90 when it materially affects a conclusion
6. State sample size whenever drawing subset conclusions

## HOW TO ANSWER
- Lead with the number, then the "so what"
- Quantify everything in both percentage and absolute terms
- Rank and prioritize — don't just list. Say which 1-2 actually matter
- Distinguish correlation from cause
- Never fabricate what isn't in the data (no booking volume, margin, conversion)
- Push back constructively if data doesn't support the premise
- EXTREME INFO DENSITY: Maximize data per sentence. Condense narrative into Markdown tables and visual structures wherever possible.
- CONCISENESS: Keep paragraphs extremely short and punchy. Use bullet points instead of long sentences.

## TONE
Direct, numerate, no filler. Write like an analyst briefing a VP who has 30 seconds. Do not waste words on pleasantries or long paragraphs.

## CORE DIRECTIVE
Prioritize VULNERABILITIES (negative contributors) and competitive gaps.
If asked what to fix, do NOT recommend scaling strengths — focus on closing gaps.
Recommendations MUST be linked to explicitly provided TARGETS.
Never use abbreviations "pt", "pts", or "pp". Always use "percentage points" explicitly.
Avoid consultant jargon ("drag", "delta", "structural deterioration", "leveraging", "material downside").

TARGET-FIRST RESPONSE FORMAT:
Your response MUST exactly follow this structure:

━━━━━━━━━━━━━━━━━━━━━━
# Executive Decision Brief
[1-2 sentences answering "What should leadership focus on?"]

━━━━━━━━━━━━━━━━━━━━━━
# Primary Target
| Metric | Value |
|---|---|
| Target | [Target Name] |
| Business Metric | [Metric Name] |
| Business Impact | [Metric Delta] |
| Volume | [Volume] |
| Expected ROI | [Expected Impact text] |

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
[Max 60-80 words. Summary of strategy and next steps.]`;

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
    // Types: ExecutiveRisk/Opportunity use `explanation` (not `description`)
    // PrioritizedInsight uses `name` (not `dimension`) and includes metricDelta directly.
    const risksText = (ep.topRisks ?? []).map(r => `  • ${r.title}: ${r.explanation}`).join("\n");
    const oppsText = (ep.topOpportunities ?? []).map(o => `  • ${o.title}: ${o.explanation}`).join("\n");
    const driversText = (ep.topDrivers ?? []).map(d => `  • ${d.name}: ${d.metricDelta} percentage points`).join("\n");

    // ── Executive Intelligence Context ──────────────────────────────────────
    const scenariosText = (ep.scenarios ?? []).map(s => `  • ${s.type}: ${s.description}`).join("\n");
    const tradeoffsText = (ep.tradeoffs ?? []).map(t => `  • ${t.title}: ${t.explanation}`).join("\n");
    const confidenceText = ep.confidenceAssessment ? `${ep.confidenceAssessment.confidence} - ${ep.confidenceAssessment.rationale}` : "N/A";
    const leadershipMessageText = ep.leadershipMessage || "N/A";
    const keyTakeawayText = ep.keyTakeaway || "N/A";

    // ── Competitor Context Section ─────────────────────────────────────────
    const competitorSection = pack.competitorName
        ? `\nCOMPETITOR CONTEXT:\n` +
          `Competitor: ${pack.competitorName}\n` +
          `All analysis below is filtered to ${pack.competitorName}-specific data.\n` +
          `Priority: Biggest loss drivers → Highest ROI recovery targets → Destination/Chain/Hotel vulnerabilities\n` +
          `Do NOT prioritize strongest positive performers.\n` +
          `Do NOT give generic recommendations that apply to any competitor.\n` +
          `Every recommendation MUST reference ${pack.competitorName} by name.\n`
        : "";

    return `USER QUESTION: "${pack.question}"
METRIC: ${pack.metricName}
OVERALL CHANGE: ${pack.metricChange ? pack.metricChange.absoluteChange.toFixed(2) + ' percentage points (' + pack.metricChange.direction + ')' : 'N/A'}
${competitorSection}
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
${oppsText || '  • None'}
TOP DRIVERS:
${driversText || '  • None'}

STRATEGIC CONTEXT (Incorporate into rationale):
  Confidence: ${confidenceText}
  Leadership Message: ${leadershipMessageText}
  Key Takeaway: ${keyTakeawayText}
  
SCENARIOS:
${scenariosText || '  • None'}

TRADEOFFS TO CONSIDER:
${tradeoffsText || '  • None'}

CRITICAL INSTRUCTION:
Your primary output MUST be a strict markdown document matching the REQUIRED MARKDOWN STRUCTURE perfectly.
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
        logger.error({ err }, "Recommendation engine safety gate blocked");
        return buildDeterministicRecommendations(pack);
    }

    // 2. Build prompt
    const prompt = buildRecommendationPrompt(pack);

    // 3. Build system prompt (with competitor mode if applicable)
    let systemPrompt = SYSTEM_PROMPT;
    if (pack.competitorName) {
        systemPrompt += `\n\nCOMPETITOR MODE — Active\nCompetitor: ${pack.competitorName}\n\nResponse MUST begin with:\nCOMPETITIVE GAP SUMMARY\nCompetitor: ${pack.competitorName}\nPrimary Vulnerability: [entity from the data]\n\nThen follow the standard TARGET-FIRST RESPONSE FORMAT.\nEvery recommendation MUST specifically address how to win against ${pack.competitorName}.\nDo NOT produce generic recommendations that would apply to any competitor.`;
        logger.info({ competitor: pack.competitorName }, "Recommendation engine competitor mode active");
    }

    // 4. Call Claude Sonnet
    try {
        const result = await generateRecommendationText(prompt, systemPrompt);

        // ── CRITICAL: Log raw Sonnet text BEFORE any parsing ─────────────
        logger.info({ chars: result.text.length, preview: result.text.slice(0, 200) }, "Recommendation engine raw Claude text");

        const recommendations = parseClaudeRecommendations(result.text);

        logger.info({ recommendations: recommendations.length, rawChars: result.text.length, cost: result.estimatedCost }, "Recommendation engine Claude returned");

        // If Claude returned nothing useful, fall back
        if (recommendations.length === 0) {
            logger.warn({}, "Recommendation engine Claude returned 0 recommendations; using deterministic");
            return buildDeterministicRecommendations(pack);
        }

        return {
            recommendations,
            claudeUsed: true,
            claudeFailed: false,
            rawClaudeText: result.text
        };
    } catch (err: any) {
        logger.error({ err, code: err.code ?? "UNKNOWN" }, "Recommendation engine Claude failed; using deterministic");
        return buildDeterministicRecommendations(pack);
    }
}

export async function generateRecommendationsStream(
    pack: ClaudeInputPack,
    opts: {
        onToken?: (chunk: string) => void;
        abortSignal?: AbortSignal;
    }
): Promise<RecommendationResult> {
    const onToken = opts.onToken ?? (() => {});
    try {
        assertClaudeInputSafe(pack);
    } catch (err) {
        logger.error({ err }, "Recommendation engine safety gate blocked");
        return buildDeterministicRecommendations(pack);
    }

    const prompt = buildRecommendationPrompt(pack);
    let systemPrompt = SYSTEM_PROMPT;
    if (pack.competitorName) {
        systemPrompt += `\n\nCOMPETITOR MODE — Active\nCompetitor: ${pack.competitorName}\n\nResponse MUST begin with:\nCOMPETITIVE GAP SUMMARY\nCompetitor: ${pack.competitorName}\nPrimary Vulnerability: [entity from the data]\n\nThen follow the standard TARGET-FIRST RESPONSE FORMAT.\nEvery recommendation MUST specifically address how to win against ${pack.competitorName}.\nDo NOT produce generic recommendations that would apply to any competitor.`;
    }

    try {
        const { generateRecommendationTextStream } = await import("./anthropicClient.js");
        const result = await generateRecommendationTextStream(
            prompt,
            systemPrompt,
            onToken,
            opts.abortSignal
        );

        logger.info({ chars: result.text.length, preview: result.text.slice(0, 200) }, "Recommendation engine raw Claude text (stream)");

        const recommendations = parseClaudeRecommendations(result.text);

        if (recommendations.length === 0) {
            logger.warn({}, "Recommendation engine Claude returned 0 recommendations; using deterministic");
            return buildDeterministicRecommendations(pack);
        }

        return {
            recommendations,
            claudeUsed: true,
            claudeFailed: false,
            rawClaudeText: result.text
        };
    } catch (err: any) {
        logger.error({ err, code: err.code ?? "UNKNOWN" }, "Recommendation engine Claude failed; using deterministic");
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
