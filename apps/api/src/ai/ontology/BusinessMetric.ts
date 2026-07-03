// ─────────────────────────────────────────────────────────────────────────────
// BusinessMetric.ts
//
// WHY THIS FILE EXISTS:
//   A BusinessMetric is the ontology's representation of a named business
//   measurement. It answers the question: "What quantities does this business
//   track, and what do they mean?"
//
//   This is intentionally DISTINCT from the SQL-level metricRegistry.ts, which
//   answers "how do we calculate this metric from DuckDB?". That is an
//   infrastructure concern. This file encodes the domain semantics: what the
//   metric *means* in business terms, when it is valid, and how to interpret it.
//
// RESPONSIBILITY:
//   Define `MetricInterpretation` and `BusinessMetric` as pure type contracts.
//   No logic, no SQL, no calculation.
//
// DESIGN DECISIONS:
//   1. `polarity: MetricPolarity` replaces `higherIsBetter: boolean`.
//      The CONTEXTUAL state captures metrics like TREND whose direction of
//      goodness depends on which underlying metric is being trended. A boolean
//      cannot represent this without additional flags.
//
//   2. `temporalScope` tells downstream components what time granularities are
//      analytically valid for this metric. CONFIDENCE is not reliable at DAILY
//      granularity — too few observations. Encoding this on the metric prevents
//      the Evidence Planner from generating nonsensical time-series queries.
//
//   3. `applicableTo` constrains which ConceptTypes this metric can measure.
//      WIN_RATE applies to hotels, chains, destinations, suppliers, and markets.
//      It does NOT apply to DATASET (you don't measure a data source's win rate).
//      This prevents the Reasoner from generating nonsensical conclusions.
//
//   4. `supportedCapabilities` allows capability-to-metric traversal.
//      "Which metrics support DIAGNOSE?" is a valid registry query.
//      Without this property, the registry can only traverse concept→metric.
//
//   5. `synonyms` enables metric-level entity resolution.
//      Executives say "win rate", "competitive performance", "winning percentage".
//      These all map to the same BusinessMetric. The registry resolves synonyms
//      without the caller needing to know the canonical MetricId.
//
//   6. `interpretation` carries business-language thresholds, not UI formatting.
//      The Business Reasoner uses these thresholds to classify metric values
//      as healthy/concerning/critical in narrative output. They are not display
//      formatting rules — they encode domain expertise.
//
// FUTURE EXTENSIBILITY:
//   - Add `benchmarks: Record<string, number>` for industry benchmark values
//     (e.g. global average win rate for luxury hotels in APAC markets).
//   - Add `correlatedMetrics: readonly MetricId[]` for metrics known to be
//     correlated, enabling the Reasoner to suggest related diagnostics.
//   - Add `dataRequirements: number` (minimum observations for statistical validity).
// ─────────────────────────────────────────────────────────────────────────────

import {
    MetricId,
    MetricType,
    MetricPolarity,
    TimeGranularity,
    ConceptType,
    CapabilityType,
} from "./types.js";

// ─── MetricInterpretation ────────────────────────────────────────────────────

/**
 * Business-language interpretation thresholds for a metric.
 *
 * This is domain expertise encoded as structured data.
 * The Business Reasoner reads these thresholds to:
 *   - Classify a metric value as good, neutral, or poor without hardcoded rules.
 *   - Frame metric changes correctly in narrative outputs
 *     ("win rate improved by 5pp" vs "win rate declined to a concerning 28%").
 *
 * DESIGN: All threshold fields are optional because thresholds vary by industry,
 * market segment, and strategic context. A 60% win rate is excellent in some
 * markets and mediocre in others. When undefined, the Reasoner applies relative
 * framing ("improved" / "declined") rather than absolute classification.
 */
export interface MetricInterpretation {
    /**
     * Business-language description of what good performance on this metric looks like.
     * Written for executive consumption. No technical jargon, no SQL, no column names.
     *
     * @example "Win rate above 65% indicates strong price competitiveness."
     */
    readonly goodPerformance: string;

    /**
     * Business-language description of what poor performance on this metric looks like.
     *
     * @example "Win rate below 40% signals systematic price disadvantage and
     *           likely customer loss to competitors."
     */
    readonly poorPerformance: string;

    /**
     * The numerical threshold above which this metric is considered "good".
     * Undefined if thresholds are highly context-dependent or not applicable.
     * For LOWER_IS_BETTER metrics, this represents the upper bound of acceptability.
     */
    readonly goodThreshold?: number;

    /**
     * The numerical threshold below which this metric is considered "poor".
     * Undefined if thresholds are highly context-dependent.
     * For LOWER_IS_BETTER metrics, this represents where the metric becomes concerning.
     */
    readonly poorThreshold?: number;

    /**
     * Optional contextual note adding nuance to raw threshold comparisons.
     * Used when the meaning of a value changes based on market conditions.
     *
     * @example "Win rate thresholds should be adjusted for high-demand periods
     *           (peak season) where market-wide rates typically rise 10–15pp."
     */
    readonly contextNote?: string;
}

// ─── BusinessMetric ──────────────────────────────────────────────────────────

/**
 * Represents a measurable business quantity in the ontology.
 *
 * A BusinessMetric is a pure business concept. It has no SQL formula,
 * no DuckDB expression, no Redis key, and no infrastructure dependency.
 * The "how to calculate it" lives in `metricRegistry.ts` (infrastructure layer).
 * The "what it means and when to use it" lives here (domain layer).
 *
 * @example
 * const winRate: BusinessMetric = {
 *   id: metricId("WIN_RATE"),
 *   type: MetricType.WIN_RATE,
 *   name: "Win Rate",
 *   description: "The percentage of competitive pricing observations ...",
 *   unit: "percentage",
 *   polarity: MetricPolarity.HIGHER_IS_BETTER,
 *   synonyms: ["win rate", "competitive performance", "winning percentage"],
 *   temporalScope: [TimeGranularity.DAILY, TimeGranularity.WEEKLY, TimeGranularity.MONTHLY],
 *   applicableTo: [ConceptType.HOTEL, ConceptType.CHAIN, ConceptType.DESTINATION],
 *   supportedCapabilities: [CapabilityType.PERFORMANCE, CapabilityType.COMPARE],
 *   interpretation: { ... },
 * };
 */
export interface BusinessMetric {
    /**
     * Globally unique identifier within the OntologyRegistry.
     * Branded `MetricId` — compiler rejects passing a `ConceptId` here.
     * Convention: SCREAMING_SNAKE_CASE matching MetricType.
     */
    readonly id: MetricId;

    /**
     * The metric's semantic category.
     * Multiple concrete metrics may share the same MetricType if they measure
     * the same business quantity in different contexts (e.g., hotel-level vs
     * market-level win rate as separate metric instances).
     */
    readonly type: MetricType;

    /**
     * Human-readable display name.
     * Used in reports, labels, and diagnostic output.
     */
    readonly name: string;

    /**
     * Business-language description of what this metric measures and why it matters.
     *
     * Must NOT reference SQL formulas, column names, database tables, or any
     * computation detail. Pure business semantics only.
     */
    readonly description: string;

    /**
     * The abstract unit of measurement.
     * Describes the *kind* of number, not its display format.
     *
     * Use: "percentage", "currency", "count", "ratio", "index"
     * NOT: "%", "USD", "#" — those are display concerns.
     */
    readonly unit: string;

    /**
     * The direction in which higher values indicate better performance.
     *
     * HIGHER_IS_BETTER → WIN_RATE, REVENUE, MARKET_SHARE, VOLUME, CONFIDENCE
     * LOWER_IS_BETTER  → PRICE_GAP (smaller gap = more competitive pricing)
     * CONTEXTUAL       → TREND (good if the *underlying* metric is improving)
     */
    readonly polarity: MetricPolarity;

    /**
     * Natural language synonyms executives use for this metric.
     * Drives `OntologyRegistry.findMetricBySynonym()` — the Analysis Registry
     * and future Question Classifier use this to map user phrasing to a MetricId.
     * All entries should be lowercase.
     */
    readonly synonyms: readonly string[];

    /**
     * The time granularities at which this metric carries analytical meaning.
     *
     * The Evidence Planner uses this to enforce appropriate aggregation levels.
     * CONFIDENCE only produces statistically valid results at MONTHLY or coarser.
     * TREND requires at least WEEKLY granularity to show meaningful patterns.
     */
    readonly temporalScope: readonly TimeGranularity[];

    /**
     * The ConceptTypes this metric can meaningfully measure.
     *
     * WIN_RATE applies to HOTEL, CHAIN, DESTINATION, SUPPLIER, MARKET.
     * It does NOT apply to DATASET (you don't measure a data source's win rate).
     *
     * The registry uses this for bi-directional traversal:
     *   - "Which metrics apply to this concept?" → `applicableMetrics` on the concept.
     *   - "Which concepts does this metric apply to?" → `applicableTo` here.
     */
    readonly applicableTo: readonly ConceptType[];

    /**
     * The CapabilityTypes that this metric enables.
     *
     * WIN_RATE enables PERFORMANCE, COMPARE, DIAGNOSE, INVESTIGATE, RECOMMEND.
     * CONFIDENCE primarily enables INVESTIGATE (data quality analysis).
     *
     * The registry uses this for: "Which capabilities require WIN_RATE as evidence?"
     */
    readonly supportedCapabilities: readonly CapabilityType[];

    /**
     * Structured business interpretation of this metric's values.
     * Used by the Business Reasoner to produce calibrated narrative assessments.
     */
    readonly interpretation: MetricInterpretation;
}