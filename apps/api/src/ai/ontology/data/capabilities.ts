// ─────────────────────────────────────────────────────────────────────────────
// data/capabilities.ts
//
// WHY THIS FILE EXISTS:
//   This file contains the eight analytical capability definitions for the
//   hospitality ontology — the complete set of reasoning operations the
//   intelligence layer can perform.
//
// RESPONSIBILITY:
//   Export eight fully-populated `BusinessCapability` objects, one per
//   CapabilityType. Each capability specifies:
//     - Which metrics it requires to produce a valid output
//     - Which EvidenceKind categories must be collected
//     - Which concept types it can be applied to
//     - What its output looks like (for the future Prompt Builder)
//     - The minimum evidence threshold for confident conclusions
//
// DESIGN DECISIONS:
//   - EvidenceKind values are the most critical fields here. These will drive
//     the EvidencePlanner's SQL collection strategy dispatch. Each EvidenceKind
//     in this file represents a distinct SQL query pattern that must be implemented
//     in the EvidencePlanner. Adding a new EvidenceKind here without implementing
//     it in the EvidencePlanner will cause a graceful "insufficient evidence" response
//     (due to the minimumEvidenceThreshold check) rather than a crash.
//
//   - `requiredMetrics` uses conservative minimum sets. The full richness of
//     a capability comes from the metric availability at the question level —
//     but these are the metrics without which the capability CANNOT produce
//     a meaningful output (not just a less rich one).
//
//   - `minimumEvidenceThreshold` values reflect the number of distinct evidence
//     queries needed. INVESTIGATE requires the most; PERFORMANCE needs only 1.
//
//   - `outputDescription` is written from the Prompt Builder's perspective —
//     it describes what Claude should be asked to produce, not what the user asked.
//
// FUTURE EXTENSIBILITY:
//   - Increase `minimumEvidenceThreshold` as the Evidence Planner matures.
//   - Add `confidenceRequirements` when the Reasoner implements confidence scoring.
//   - Add `composedOf: CapabilityId[]` for compound capability definitions.
// ─────────────────────────────────────────────────────────────────────────────

import { BusinessCapability } from "../BusinessCapability.js";
import {
    CapabilityType,
    ConceptType,
    EvidenceKind,
    capabilityId,
    metricId,
} from "../types.js";

// ─── Capability: Performance ──────────────────────────────────────────────────
//
// Performance is the most common executive question: "How are we doing?"
// It requires the least evidence — a single aggregate summary is sufficient.

export const PERFORMANCE_CAPABILITY: BusinessCapability = {
    id:   capabilityId("PERFORMANCE"),
    type: CapabilityType.PERFORMANCE,
    name: "Performance Assessment",

    description:
        "Evaluates how a business entity is performing on one or more metrics at a " +
        "given point in time or over a period. Answers questions like: " +
        "'What is our win rate in Pattaya this month?' or 'How is Marriott performing?'. " +
        "This is the baseline capability — it reads current metric values and contextualizes " +
        "them against known thresholds and historical norms.",

    // WIN_RATE is the minimum required metric. Without it, a competitiveness
    // performance assessment has no measurable output.
    requiredMetrics: [
        metricId("WIN_RATE"),
    ],

    // A single aggregate summary is the minimum evidence for performance assessment.
    // CONFIDENCE_SIGNAL ensures the Reasoner knows whether to hedge its conclusion.
    evidenceKinds: [
        EvidenceKind.AGGREGATE_SUMMARY,
        EvidenceKind.CONFIDENCE_SIGNAL,
    ],

    applicableConcepts: [
        ConceptType.HOTEL,
        ConceptType.CHAIN,
        ConceptType.DESTINATION,
        ConceptType.SUPPLIER,
        ConceptType.MARKET,
    ],

    outputDescription:
        "A structured performance summary with current metric values, directional " +
        "assessment (good/concerning/poor) based on interpretation thresholds, " +
        "and a one-paragraph executive narrative contextualizing the results.",

    minimumEvidenceThreshold: 1,
};

// ─── Capability: Compare ──────────────────────────────────────────────────────
//
// Compare answers "How do A and B differ?" — the most common executive follow-up
// after a performance question reveals an unexpected result.

export const COMPARE_CAPABILITY: BusinessCapability = {
    id:   capabilityId("COMPARE"),
    type: CapabilityType.COMPARE,
    name: "Comparison",

    description:
        "Compares two or more business entities (hotels, suppliers, destinations, " +
        "chains) on one or more metrics side-by-side. Answers: 'How does Bangkok " +
        "compare to Phuket on win rate?' or 'How does Booking.com compete versus " +
        "Expedia in our portfolio?'. Reveals relative differences, ranking gaps, " +
        "and contextualizes individual performance against peers.",

    // Comparison requires at least WIN_RATE to be meaningful in a competitive context.
    requiredMetrics: [
        metricId("WIN_RATE"),
    ],

    // COMPARATIVE_SNAPSHOT is the core evidence: point-in-time metrics per entity.
    // RANKING_TABLE provides relative ordering.
    // CONFIDENCE_SIGNAL flags whether the comparison is statistically valid.
    evidenceKinds: [
        EvidenceKind.COMPARATIVE_SNAPSHOT,
        EvidenceKind.RANKING_TABLE,
        EvidenceKind.CONFIDENCE_SIGNAL,
    ],

    applicableConcepts: [
        ConceptType.HOTEL,
        ConceptType.CHAIN,
        ConceptType.DESTINATION,
        ConceptType.SUPPLIER,
        ConceptType.MARKET,
    ],

    outputDescription:
        "A side-by-side comparison table with metric values per entity, percentage " +
        "deltas between entities, directional indicators (↑↓=), and an executive " +
        "narrative summarizing the most significant differences and their implications.",

    minimumEvidenceThreshold: 1,
};

// ─── Capability: Diagnose ─────────────────────────────────────────────────────
//
// Diagnose answers "What is driving this metric to its current level?"
// It requires deeper evidence: trend data to show movement, breakdowns to
// isolate contributing factors, and causal traces to link cause to effect.

export const DIAGNOSE_CAPABILITY: BusinessCapability = {
    id:   capabilityId("DIAGNOSE"),
    type: CapabilityType.DIAGNOSE,
    name: "Diagnosis",

    description:
        "Identifies the primary drivers behind a metric's current level or recent change. " +
        "Answers: 'Why is our win rate in Dubai only 38%?' or 'What is driving the " +
        "bookings decline in Q3?'. Diagnose goes beyond stating the metric value — " +
        "it systematically decomposes the metric by dimensions (destination, supplier, " +
        "chain, APW) to isolate the highest-impact contributing factors.",

    // WIN_RATE is required to diagnose competitive performance.
    // PRICE_GAP is required to explain WHY we are winning or losing.
    requiredMetrics: [
        metricId("WIN_RATE"),
        metricId("PRICE_GAP"),
    ],

    // TREND_SERIES shows the metric's movement over time (when did it change?).
    // ENTITY_BREAKDOWN isolates which dimension member is driving the change.
    // CAUSAL_TRACE links the breakdown finding to a causal mechanism.
    // CONFIDENCE_SIGNAL ensures the diagnosis is based on sufficient data.
    evidenceKinds: [
        EvidenceKind.TREND_SERIES,
        EvidenceKind.ENTITY_BREAKDOWN,
        EvidenceKind.CAUSAL_TRACE,
        EvidenceKind.CONFIDENCE_SIGNAL,
    ],

    applicableConcepts: [
        ConceptType.HOTEL,
        ConceptType.CHAIN,
        ConceptType.DESTINATION,
        ConceptType.SUPPLIER,
        ConceptType.MARKET,
    ],

    outputDescription:
        "A ranked list of contributing drivers with quantified impact on the metric " +
        "(e.g. 'Supplier X accounts for 60% of the win rate decline'), time-of-change " +
        "identification, and a structured narrative explaining the chain of causality " +
        "from identified drivers to the observed metric outcome.",

    minimumEvidenceThreshold: 2,
};

// ─── Capability: Explain ──────────────────────────────────────────────────────
//
// Explain goes deeper than Diagnose — it answers "Why did this specific event
// happen?" rather than "What is driving the current state?". It requires causal
// evidence connecting a prior event to a subsequent metric change.

export const EXPLAIN_CAPABILITY: BusinessCapability = {
    id:   capabilityId("EXPLAIN"),
    type: CapabilityType.EXPLAIN,
    name: "Explanation",

    description:
        "Provides a causal explanation for a specific business event or metric change. " +
        "Answers: 'Why did our win rate drop by 12pp in March?' or 'Why did Booking.com " +
        "suddenly win more in Bangkok?' Explanation requires identifying not just what " +
        "changed but what caused the change — a pricing action, a competitive rate change, " +
        "a demand shift, or a data anomaly.",

    requiredMetrics: [
        metricId("WIN_RATE"),
        metricId("PRICE_GAP"),
        metricId("TREND"),
    ],

    // CAUSAL_TRACE is the core evidence — it connects a prior event to a metric change.
    // TREND_SERIES shows the timeline of the change (when did it start?).
    // ANOMALY_DETECTION identifies whether the change is statistically unusual.
    // ENTITY_BREAKDOWN pinpoints which entities were affected and which were not.
    evidenceKinds: [
        EvidenceKind.CAUSAL_TRACE,
        EvidenceKind.TREND_SERIES,
        EvidenceKind.ANOMALY_DETECTION,
        EvidenceKind.ENTITY_BREAKDOWN,
    ],

    applicableConcepts: [
        ConceptType.HOTEL,
        ConceptType.DESTINATION,
        ConceptType.SUPPLIER,
        ConceptType.MARKET,
    ],

    outputDescription:
        "A structured causal narrative identifying the specific trigger event, " +
        "the timeline of the metric change, the entities most affected, and a " +
        "confidence assessment of the causal link. Includes a counterfactual: " +
        "'Had this not occurred, the metric would likely have remained at X.'",

    minimumEvidenceThreshold: 2,
};

// ─── Capability: Recommend ────────────────────────────────────────────────────
//
// Recommend answers "What should we do about it?" — the action-oriented capability
// that translates analysis into executive decisions. It requires the richest
// evidence set because recommendations must be defensible.

export const RECOMMEND_CAPABILITY: BusinessCapability = {
    id:   capabilityId("RECOMMEND"),
    type: CapabilityType.RECOMMEND,
    name: "Recommendation",

    description:
        "Generates specific, actionable business recommendations based on the " +
        "current performance state and identified improvement opportunities. " +
        "Answers: 'What should we do to improve win rate in Dubai?' or " +
        "'Which hotels should we prioritize for rate renegotiation?'. " +
        "Recommendations are grounded in metric evidence and directly actionable " +
        "by hotel commercial teams, revenue managers, or procurement.",

    // Recommendations require the full competitive picture:
    // win rate (current competitive position), price gap (pricing lever),
    // and volume (opportunity sizing — is this worth fixing?).
    requiredMetrics: [
        metricId("WIN_RATE"),
        metricId("PRICE_GAP"),
        metricId("VOLUME"),
    ],

    // AGGREGATE_SUMMARY: current baseline before recommending improvement.
    // ENTITY_BREAKDOWN: which specific entities need action (not just "hotels").
    // MARKET_CONTEXT: benchmark recommendations against what is achievable.
    // RANKING_TABLE: prioritizes which recommendation will have the largest impact.
    evidenceKinds: [
        EvidenceKind.AGGREGATE_SUMMARY,
        EvidenceKind.ENTITY_BREAKDOWN,
        EvidenceKind.MARKET_CONTEXT,
        EvidenceKind.RANKING_TABLE,
    ],

    applicableConcepts: [
        ConceptType.HOTEL,
        ConceptType.CHAIN,
        ConceptType.DESTINATION,
        ConceptType.MARKET,
    ],

    outputDescription:
        "A set of specific, ranked, actionable recommendations with: " +
        "(1) the recommended action, (2) which entity it applies to, " +
        "(3) the expected impact on the relevant metric, and " +
        "(4) a confidence level based on the quality of supporting evidence. " +
        "Structured for executive briefings and operational handoff.",

    minimumEvidenceThreshold: 2,
};

// ─── Capability: Forecast ─────────────────────────────────────────────────────
//
// Forecast answers "Where is this metric heading?" — forward-looking reasoning
// based on historical trend extrapolation. It is the least certain capability
// and requires the most evidence to produce trustworthy projections.

export const FORECAST_CAPABILITY: BusinessCapability = {
    id:   capabilityId("FORECAST"),
    type: CapabilityType.FORECAST,
    name: "Forecast",

    description:
        "Projects the future trajectory of a business metric based on historical " +
        "trends, seasonal patterns, and current momentum. Answers: 'What will our " +
        "win rate look like next quarter if current trends continue?' or " +
        "'Will booking volume in Bangkok recover by year-end?'. " +
        "Forecasts are probabilistic — they state an expected direction and range, " +
        "not a precise number, unless data quality and trend consistency warrant it.",

    // TREND is required — you cannot forecast without a historical trend baseline.
    // WIN_RATE is required for competitive forecasting.
    requiredMetrics: [
        metricId("TREND"),
        metricId("WIN_RATE"),
    ],

    // TREND_SERIES: the historical baseline for extrapolation.
    // FORECAST_PROJECTION: the forward-looking time series projection.
    // CONFIDENCE_SIGNAL: how reliable the historical data is (affects forecast confidence).
    // MARKET_CONTEXT: external market factors that might disrupt the trend.
    evidenceKinds: [
        EvidenceKind.TREND_SERIES,
        EvidenceKind.FORECAST_PROJECTION,
        EvidenceKind.CONFIDENCE_SIGNAL,
        EvidenceKind.MARKET_CONTEXT,
    ],

    applicableConcepts: [
        ConceptType.HOTEL,
        ConceptType.CHAIN,
        ConceptType.DESTINATION,
        ConceptType.MARKET,
    ],

    outputDescription:
        "A forward-looking projection with a stated time horizon, expected metric " +
        "direction and approximate range, confidence level based on trend consistency, " +
        "key assumptions, and 1–2 risk factors that could invalidate the forecast. " +
        "Framed as a probabilistic assessment, not a deterministic prediction.",

    minimumEvidenceThreshold: 2,
};

// ─── Capability: Investigate ──────────────────────────────────────────────────
//
// Investigate is the deep-dive capability — it surfaces anomalies, outliers,
// and unexpected patterns that require further executive attention. It is the
// broadest capability in terms of evidence requirements.

export const INVESTIGATE_CAPABILITY: BusinessCapability = {
    id:   capabilityId("INVESTIGATE"),
    type: CapabilityType.INVESTIGATE,
    name: "Investigation",

    description:
        "Conducts a systematic deep-dive to surface anomalies, outliers, and " +
        "unexpected patterns within a dataset, concept, or metric. Answers: " +
        "'Are there any hotels with unusually low win rates that don't fit the pattern?' " +
        "or 'Which destinations had unexpected booking spikes last month?' " +
        "Investigation is exploratory — it does not start with a hypothesis but instead " +
        "scans for signals that warrant executive attention and follow-up.",

    // VOLUME is required — investigation without knowing how much data backs it
    // is statistically meaningless.
    requiredMetrics: [
        metricId("VOLUME"),
        metricId("CONFIDENCE"),
    ],

    // Investigation requires the broadest evidence set:
    // ANOMALY_DETECTION: statistical outlier identification.
    // ENTITY_BREAKDOWN: which specific entities are anomalous.
    // TREND_SERIES: whether the anomaly is new or persistent.
    // CONFIDENCE_SIGNAL: filter out false positives from low-data entities.
    evidenceKinds: [
        EvidenceKind.ANOMALY_DETECTION,
        EvidenceKind.ENTITY_BREAKDOWN,
        EvidenceKind.TREND_SERIES,
        EvidenceKind.CONFIDENCE_SIGNAL,
    ],

    // Investigation applies to all concept types, including DATASET (data quality audit).
    applicableConcepts: [
        ConceptType.HOTEL,
        ConceptType.CHAIN,
        ConceptType.DESTINATION,
        ConceptType.SUPPLIER,
        ConceptType.MARKET,
        ConceptType.DATASET,
    ],

    outputDescription:
        "A structured list of anomalies and outliers, ordered by statistical " +
        "significance and business impact. Each finding includes: the entity and " +
        "metric involved, the nature of the anomaly (spike/dip/outlier), how long " +
        "it has persisted, and whether it is statistically significant given the " +
        "available data volume. Flags items requiring immediate executive attention.",

    minimumEvidenceThreshold: 2,
};

// ─── Capability: Prioritize ───────────────────────────────────────────────────
//
// Prioritize answers "Where should we focus first?" — the resource allocation
// capability that ranks opportunities by business impact. Executives use this
// when they have limited attention and need to know where to act.

export const PRIORITIZE_CAPABILITY: BusinessCapability = {
    id:   capabilityId("PRIORITIZE"),
    type: CapabilityType.PRIORITIZE,
    name: "Prioritization",

    description:
        "Ranks business entities (hotels, destinations, markets) by the magnitude " +
        "of their improvement opportunity, taking into account current performance " +
        "gaps, booking volume at risk, and achievability of improvement. " +
        "Answers: 'Which 3 destinations should we focus on first for maximum win rate " +
        "improvement?' or 'Where should we allocate pricing resources for the highest ROI?' " +
        "Prioritization combines opportunity size (volume at risk) with gap severity " +
        "(how far below target) and competitive context (is improvement achievable?).",

    // WIN_RATE and VOLUME are required to calculate opportunity size:
    // opportunity = volume × (target_win_rate - current_win_rate).
    requiredMetrics: [
        metricId("WIN_RATE"),
        metricId("VOLUME"),
    ],

    // RANKING_TABLE: the core output — entities ordered by opportunity size.
    // COMPARATIVE_SNAPSHOT: current performance baseline per entity.
    // MARKET_CONTEXT: benchmark against what is achievable in each market.
    // CONFIDENCE_SIGNAL: exclude low-data entities from the priority list.
    evidenceKinds: [
        EvidenceKind.RANKING_TABLE,
        EvidenceKind.COMPARATIVE_SNAPSHOT,
        EvidenceKind.MARKET_CONTEXT,
        EvidenceKind.CONFIDENCE_SIGNAL,
    ],

    applicableConcepts: [
        ConceptType.HOTEL,
        ConceptType.CHAIN,
        ConceptType.DESTINATION,
        ConceptType.MARKET,
    ],

    outputDescription:
        "A prioritized list of entities ranked by total opportunity size, with: " +
        "(1) current metric value, (2) target/benchmark metric value, " +
        "(3) estimated opportunity size (volume × gap), (4) confidence in the estimate, " +
        "and (5) a one-line rationale for each entity's priority ranking. " +
        "Structured for executive briefings and operational resource allocation.",

    minimumEvidenceThreshold: 2,
};

// ─── Aggregated Export ────────────────────────────────────────────────────────

export const ALL_CAPABILITIES: BusinessCapability[] = [
    PERFORMANCE_CAPABILITY,
    COMPARE_CAPABILITY,
    DIAGNOSE_CAPABILITY,
    EXPLAIN_CAPABILITY,
    RECOMMEND_CAPABILITY,
    FORECAST_CAPABILITY,
    INVESTIGATE_CAPABILITY,
    PRIORITIZE_CAPABILITY,
];
