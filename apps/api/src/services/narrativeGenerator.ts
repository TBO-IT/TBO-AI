// ─── Narrative Generator ──────────────────────────────────────────────────────
//
// Transforms a ClaudeInputPack into an executive-grade narrative.
//
// Flow:
//   1. ClaudeRouter decides tier (NONE / HAIKU / SONNET)
//   2. If NONE: build deterministic narrative from facts
//   3. If HAIKU: build prompt from pack → send to Haiku → parse response
//   4. Always fall back to deterministic if Claude fails
//
// Claude prompt rules:
//   - Use ONLY provided facts
//   - Never invent numbers or entities
//   - Handle contradictions explicitly
//   - Concise executive language
// ───────────────────────────────────────────────────────────────────────────────

import { ClaudeInputPack, assertClaudeInputSafe } from "./claudeInputContract.js";
import { routeClaude, ClaudeRouterDecision } from "./claudeRouter.js";
import { generateText, AnthropicClientError } from "./anthropicClient.js";
import crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExecutiveNarrative {
    executiveSummary: string;
    keyDrivers: string[];
    risks: string[];
    contradictionNote?: string;
    /** Which Claude tier was used (NONE = deterministic) */
    claudeTier: string;
    /** Whether Claude was called and succeeded */
    claudeUsed: boolean;
    /** Whether Claude failed and fallback was used */
    claudeFailed: boolean;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const narrativeCache = new Map<string, { narrative: ExecutiveNarrative; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function buildCacheKey(pack: ClaudeInputPack, tier: string): string {
    const hash = crypto
        .createHash("md5")
        .update(JSON.stringify({ q: pack.question, m: pack.metricName, mc: pack.metricChange, t: tier }))
        .digest("hex")
        .slice(0, 16);
    return `narrative:${hash}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates an executive narrative from a ClaudeInputPack.
 *
 * @param pack - Validated ClaudeInputPack (never raw data)
 * @param enableClaude - Whether to allow Claude calls (set false for testing/offline)
 */
export async function generateNarrative(
    pack: ClaudeInputPack,
    enableClaude: boolean = true
): Promise<ExecutiveNarrative> {

    // 1. Route decision
    const routing: ClaudeRouterDecision = enableClaude
        ? routeClaude("ROOT_CAUSE", "NARRATIVE_GENERATION", true)
        : routeClaude("TEMPLATE", null, false);

    // 2. Check cache
    const cacheKey = buildCacheKey(pack, routing.tier);
    const cached = narrativeCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        console.log(`[NARRATIVE_CACHE] HIT | key=${cacheKey}`);
        return cached.narrative;
    }
    console.log(`[NARRATIVE_CACHE] MISS | key=${cacheKey}`);

    // 3. Build deterministic narrative (always — serves as baseline AND fallback)
    const deterministic = buildDeterministicExecutiveNarrative(pack);

    // 4. If Claude not needed, return deterministic
    if (!routing.shouldCallClaude || !enableClaude) {
        cacheNarrative(cacheKey, deterministic);
        return deterministic;
    }

    // 5. Safety gate
    try {
        assertClaudeInputSafe(pack);
    } catch (err) {
        console.error("[NARRATIVE_GENERATOR] Safety check FAILED — using deterministic:", err);
        return deterministic;
    }

    // 6. Call Claude
    try {
        const prompt = buildNarrativePrompt(pack);
        const result = await generateText({
            prompt,
            systemPrompt: NARRATIVE_SYSTEM_PROMPT,
            tier: routing.tier as "HAIKU" | "SONNET",
            maxTokens: routing.maxTokens,
            temperature: 0.1,
            operation: "NARRATIVE_GENERATION"
        });

        const claudeNarrative: ExecutiveNarrative = {
            executiveSummary: result.text,
            keyDrivers: deterministic.keyDrivers,
            risks: deterministic.risks,
            contradictionNote: deterministic.contradictionNote,
            claudeTier: routing.tier,
            claudeUsed: true,
            claudeFailed: false
        };

        cacheNarrative(cacheKey, claudeNarrative);
        return claudeNarrative;
    } catch (err) {
        console.error("[NARRATIVE_GENERATOR] Claude failed — falling back to deterministic:", err);
        const fallback: ExecutiveNarrative = {
            ...deterministic,
            claudeFailed: true
        };
        cacheNarrative(cacheKey, fallback);
        return fallback;
    }
}

// ─── Deterministic Builder ────────────────────────────────────────────────────

function buildDeterministicExecutiveNarrative(pack: ClaudeInputPack): ExecutiveNarrative {
    const keyDrivers: string[] = [];
    const risks: string[] = [];

    // Contradiction shortcut
    if (pack.contradictionDetected) {
        return {
            executiveSummary:
                `Contradiction Detected: The data shows the opposite of what was expected. ` +
                `You asked about a ${pack.expectedDirection}, but ${pack.metricName} actually ` +
                `${pack.metricChange?.direction === "increase" ? "increased" : "declined"} ` +
                `by ${Math.abs(pack.metricChange?.absoluteChange ?? 0).toFixed(2)} points.`,
            keyDrivers: [],
            risks: ["The assumption in the question does not match reality. Review the underlying data."],
            contradictionNote:
                `Expected: ${pack.expectedDirection}. ` +
                `Actual: ${pack.metricChange?.direction} (${pack.metricChange?.absoluteChange?.toFixed(2)} points).`,
            claudeTier: "NONE",
            claudeUsed: false,
            claudeFailed: false
        };
    }

    // Executive Summary
    let summary = "";
    if (pack.metricChange) {
        const dir = pack.metricChange.direction;
        const abs = Math.abs(pack.metricChange.absoluteChange).toFixed(2);
        summary = `${pack.metricName} ${dir === "increase" ? "improved" : dir === "decline" ? "declined" : "remained flat"} ` +
            `by ${abs} points from ${pack.metricChange.priorPeriod} to ${pack.metricChange.currentPeriod}.`;
    } else {
        summary = `Analysis of ${pack.metricName} across ${pack.totalRows} data points.`;
    }

    // Key Drivers
    for (const c of pack.topPositiveContributors.slice(0, 5)) {
        keyDrivers.push(
            `${c.name}: +${c.weightedContribution.toFixed(2)} points (${c.contributionPct.toFixed(1)}% of total change), ` +
            `${c.volumeSharePct.toFixed(1)}% volume share`
        );
    }

    // Risks
    for (const c of pack.topNegativeContributors.slice(0, 5)) {
        risks.push(
            `${c.name}: ${c.weightedContribution.toFixed(2)} points (${c.contributionPct.toFixed(1)}% of total change), ` +
            `${c.volumeSharePct.toFixed(1)}% volume share`
        );
    }

    return {
        executiveSummary: summary,
        keyDrivers,
        risks,
        claudeTier: "NONE",
        claudeUsed: false,
        claudeFailed: false
    };
}

// ─── Prompt Construction ──────────────────────────────────────────────────────

const NARRATIVE_SYSTEM_PROMPT =
    "You are an Executive Analytics Copilot writing a C-suite briefing memo for a travel industry executive.\n\n" +
    "RULES:\n" +
    "1. Use ONLY the facts provided in the user message. Do NOT invent numbers.\n" +
    "2. Do NOT invent entity names that are not in the data.\n" +
    "3. If a contradiction is noted, address it directly and clearly.\n" +
    "4. Use concise, executive language. No technical jargon.\n" +
    "5. Never reference SQL, databases, queries, or technical infrastructure.\n" +
    "6. Structure your response as: Executive Summary → Key Drivers → Risks.";

function buildNarrativePrompt(pack: ClaudeInputPack): string {
    const sections: string[] = [];

    sections.push(`USER QUESTION: "${pack.question}"`);
    sections.push(`METRIC: ${pack.metricName}`);
    sections.push(`VALIDATION: ${pack.validationStatus}`);

    if (pack.metricChange) {
        sections.push(
            `OVERALL CHANGE: ${pack.metricChange.absoluteChange > 0 ? "+" : ""}${pack.metricChange.absoluteChange.toFixed(2)} points ` +
            `(${pack.metricChange.direction}) from ${pack.metricChange.priorPeriod} to ${pack.metricChange.currentPeriod}`
        );
        if (pack.metricChange.relativeChangePct !== 0) {
            sections.push(`RELATIVE CHANGE: ${pack.metricChange.relativeChangePct.toFixed(1)}%`);
        }
    }

    if (pack.contradictionDetected) {
        sections.push(`\nCONTRADICTION: The user expected "${pack.expectedDirection}", but the data shows "${pack.metricChange?.direction}". Address this directly.`);
    }

    if (pack.topPositiveContributors.length > 0) {
        sections.push("\nTOP POSITIVE CONTRIBUTORS:");
        for (const c of pack.topPositiveContributors.slice(0, 5)) {
            sections.push(`  • ${c.name}: +${c.weightedContribution.toFixed(2)} pts (${c.contributionPct.toFixed(1)}% of change), ${c.volumeSharePct.toFixed(1)}% volume`);
        }
    }

    if (pack.topNegativeContributors.length > 0) {
        sections.push("\nTOP NEGATIVE CONTRIBUTORS:");
        for (const c of pack.topNegativeContributors.slice(0, 5)) {
            sections.push(`  • ${c.name}: ${c.weightedContribution.toFixed(2)} pts (${c.contributionPct.toFixed(1)}% of change), ${c.volumeSharePct.toFixed(1)}% volume`);
        }
    }

    if (pack.affectedHotels.length > 0) {
        sections.push(`\nAFFECTED HOTELS: ${pack.affectedHotels.length} analyzed`);
    }
    if (pack.affectedChains.length > 0) {
        sections.push(`AFFECTED CHAINS: ${pack.affectedChains.length} analyzed`);
    }
    if (pack.affectedSuppliers.length > 0) {
        sections.push(`AFFECTED SUPPLIERS: ${pack.affectedSuppliers.length} analyzed`);
    }

    sections.push(`\nTOTAL DATA POINTS: ${pack.totalRows}`);
    sections.push("\nWrite a concise executive briefing covering: Executive Summary, Key Drivers, and Risks.");
    sections.push("Use ONLY the facts above. Do NOT hallucinate additional data.");

    return sections.join("\n");
}

// ─── Cache Helper ─────────────────────────────────────────────────────────────

function cacheNarrative(key: string, narrative: ExecutiveNarrative): void {
    narrativeCache.set(key, { narrative, timestamp: Date.now() });
    // Evict old entries
    if (narrativeCache.size > 500) {
        const oldestKey = narrativeCache.keys().next().value;
        if (oldestKey) narrativeCache.delete(oldestKey);
    }
}
