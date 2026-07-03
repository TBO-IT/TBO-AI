// ─────────────────────────────────────────────────────────────────────────────
// data/metrics.ts
//
// WHY THIS FILE EXISTS:
//   This file contains the seven business-level metric definitions for the
//   hospitality ontology. These are pure domain objects — they describe what
//   each metric *means* in business terms, not how to calculate it.
//
// RESPONSIBILITY:
//   Export seven fully-populated `BusinessMetric` objects corresponding to the
//   MetricType enum values. Each metric carries:
//     - Business-language description and interpretation thresholds
//     - Polarity (how to read "better" vs "worse")
//     - Temporal scope (when the metric is analytically valid)
//     - Concept applicability (which entity types this metric measures)
//     - Capability enablement (which analytical operations this metric unlocks)
//     - Natural language synonyms for entity resolution
//
// RELATIONSHIP TO metricRegistry.ts:
//   `metricRegistry.ts` contains SQL formulas (infrastructure concern).
//   This file contains business semantics (domain concern).
//   They are intentionally separate. The canonical metric IDs here
//   (e.g. "WIN_RATE") are the bridge — the Analytics Engine can look up
//   the formula for "WIN_RATE" in metricRegistry.ts while the Reasoner
//   looks up its interpretation here.
//
//   NOTE: The ontology uses 7 business-level metric types. The metricRegistry
//   has more fine-grained SQL-level metrics (e.g. avg_price_diff vs median_price_diff
//   are both implementations of the PRICE_GAP business metric). This is correct:
//   the ontology models what the business cares about; the registry models how
//   the analytics engine computes it.
//
// DESIGN DECISIONS:
//   - Interpretation thresholds reflect hospitality industry norms for TBO's
//     competitive context (B2B travel wholesale). They are NOT universal truths.
//     When extending to other industries, override or replace these data files.
//   - `temporalScope` arrays reflect genuine analytical validity — CONFIDENCE
//     is not reliable at DAILY granularity with few observations.
//   - All synonym arrays are lowercase. The registry normalizes before lookup.
//
// FUTURE EXTENSIBILITY:
//   - Add a `benchmarks` field with industry average values for context.
//   - Add a `correlatedMetricIds` field to guide the Reasoner's root-cause traversal.
//   - Split into one file per MetricType for large-scale multi-industry registries.
// ─────────────────────────────────────────────────────────────────────────────

import { BusinessMetric } from "../BusinessMetric.js";
import {
    MetricType,
    MetricPolarity,
    TimeGranularity,
    ConceptType,
    CapabilityType,
    metricId,
} from "../types.js";

// ─── Metric: Win Rate ─────────────────────────────────────────────────────────
//
// Win rate is the primary competitive health metric. It measures how often
// TBO's pricing beats competitors in head-to-head observations. It is the
// most frequently referenced metric by executives in this domain.

export const WIN_RATE_METRIC: BusinessMetric = {
    id:   metricId("WIN_RATE"),
    type: MetricType.WIN_RATE,
    name: "Win Rate",

    description:
        "The percentage of competitive pricing observations where TBO's price is lower " +
        "than or equal to the competing supplier's price. A win rate of 65% means TBO " +
        "offered the better price in 65 out of every 100 direct price comparisons. " +
        "Win rate is the primary measure of price competitiveness and the leading " +
        "indicator of future booking volume and market share.",

    unit:     "percentage",
    polarity: MetricPolarity.HIGHER_IS_BETTER,

    synonyms: [
        "win rate",
        "win-rate",
        "winrate",
        "winning rate",
        "competitive performance",
        "competitiveness",
        "winning percentage",
        "win percentage",
        "how we are winning",
        "wins",
        "competitive win rate",
        "price win rate",
    ],

    // Win rate is valid at all meaningful time granularities.
    // DAILY is valid but noisy — context note on interpretation handles this.
    temporalScope: [
        TimeGranularity.DAILY,
        TimeGranularity.WEEKLY,
        TimeGranularity.MONTHLY,
        TimeGranularity.QUARTERLY,
        TimeGranularity.YEARLY,
        TimeGranularity.ROLLING,
    ],

    // Win rate applies to all business entities except DATASET.
    applicableTo: [
        ConceptType.HOTEL,
        ConceptType.CHAIN,
        ConceptType.DESTINATION,
        ConceptType.SUPPLIER,
        ConceptType.MARKET,
    ],

    // Win rate unlocks the broadest set of capabilities — it is the most information-rich
    // metric for competitive analysis, diagnosis, and strategic recommendations.
    supportedCapabilities: [
        CapabilityType.PERFORMANCE,
        CapabilityType.COMPARE,
        CapabilityType.DIAGNOSE,
        CapabilityType.EXPLAIN,
        CapabilityType.RECOMMEND,
        CapabilityType.INVESTIGATE,
        CapabilityType.PRIORITIZE,
    ],

    interpretation: {
        goodPerformance:
            "Win rate above 65% indicates strong price competitiveness — TBO is offering " +
            "better prices than competitors in the majority of observations. " +
            "Properties and markets at this level typically show strong booking conversion.",

        poorPerformance:
            "Win rate below 40% signals a systematic price disadvantage. TBO is losing " +
            "more than 60% of price comparisons, which directly reduces booking volume " +
            "and market share. Immediate pricing review is warranted.",

        goodThreshold:  65,
        poorThreshold:  40,

        contextNote:
            "Win rate thresholds should be interpreted relative to destination averages — " +
            "a 55% win rate in a high-competition luxury market may be excellent, " +
            "while the same rate in a budget segment with few competitors may be concerning. " +
            "Daily win rates can be volatile; prefer weekly or monthly rolling averages " +
            "for strategic decisions.",
    },
};

// ─── Metric: Price Gap ────────────────────────────────────────────────────────
//
// Price gap (price difference) measures how far TBO's price is from the
// competitor's price, as a percentage. It is the explanatory companion to
// win rate — win rate tells you IF you're winning; price gap tells you BY HOW MUCH.

export const PRICE_GAP_METRIC: BusinessMetric = {
    id:   metricId("PRICE_GAP"),
    type: MetricType.PRICE_GAP,
    name: "Price Gap",

    description:
        "The average percentage difference between TBO's price and the competitor's " +
        "price in competitive observations. A positive price gap means TBO's price is " +
        "higher (TBO is more expensive); a negative price gap means TBO is cheaper. " +
        "Price gap quantifies HOW MUCH of a price advantage or disadvantage exists, " +
        "complementing win rate which measures FREQUENCY of winning.",

    unit:     "percentage points",
    polarity: MetricPolarity.LOWER_IS_BETTER,

    synonyms: [
        "price gap",
        "price difference",
        "price differential",
        "avg price diff",
        "average price difference",
        "average price gap",
        "price delta",
        "pricing gap",
        "price distance",
        "mean price diff",
        "median price gap",
        "median price difference",
    ],

    // Price gap is most reliable at weekly and longer granularities.
    // Daily price gaps can be dominated by outlier observations (rate loading errors,
    // promotional spikes) that skew the average significantly.
    temporalScope: [
        TimeGranularity.WEEKLY,
        TimeGranularity.MONTHLY,
        TimeGranularity.QUARTERLY,
        TimeGranularity.ROLLING,
    ],

    applicableTo: [
        ConceptType.HOTEL,
        ConceptType.DESTINATION,
        ConceptType.SUPPLIER,
        ConceptType.MARKET,
    ],

    supportedCapabilities: [
        CapabilityType.PERFORMANCE,
        CapabilityType.COMPARE,
        CapabilityType.DIAGNOSE,
        CapabilityType.EXPLAIN,
        CapabilityType.RECOMMEND,
        CapabilityType.INVESTIGATE,
    ],

    interpretation: {
        goodPerformance:
            "A price gap near 0 or negative (TBO is cheaper) indicates strong price " +
            "positioning. When TBO's prices are 0–5% below competitors, booking " +
            "conversion is typically optimal — low enough to win but not so low as " +
            "to sacrifice margin unnecessarily.",

        poorPerformance:
            "A price gap above +10% (TBO is more than 10% more expensive) represents " +
            "a significant competitive disadvantage. At this level, customers have " +
            "a clear financial incentive to book with the competitor, directly " +
            "causing win rate decline and booking volume loss.",

        goodThreshold:  0,
        poorThreshold:  10,

        contextNote:
            "Price gap direction matters: positive means TBO is more expensive (bad), " +
            "negative means TBO is cheaper (good). Interpret the sign before the magnitude. " +
            "Acceptable price gaps vary by hotel star rating — luxury travelers are less " +
            "price-sensitive than budget travelers.",
    },
};

// ─── Metric: Revenue ─────────────────────────────────────────────────────────
//
// Revenue measures the total monetary value of bookings. It is the ultimate
// financial output metric — all competitive and operational improvements
// should ultimately show up as revenue improvement.

export const REVENUE_METRIC: BusinessMetric = {
    id:   metricId("REVENUE"),
    type: MetricType.REVENUE,
    name: "Revenue",

    description:
        "The total monetary value of hotel bookings processed through TBO. Revenue " +
        "is the primary financial performance metric, capturing the combined effect of " +
        "booking volume and average booking value. Executives track total, vouchered " +
        "(confirmed), and net revenue (after cancellations) as indicators of business " +
        "health and growth trajectory.",

    unit:     "currency",
    polarity: MetricPolarity.HIGHER_IS_BETTER,

    synonyms: [
        "revenue",
        "total revenue",
        "gross revenue",
        "total sales",
        "gross sales",
        "sales",
        "booking value",
        "income",
        "top line",
        "net sales",
        "vouchered sales",
        "confirmed revenue",
    ],

    temporalScope: [
        TimeGranularity.DAILY,
        TimeGranularity.WEEKLY,
        TimeGranularity.MONTHLY,
        TimeGranularity.QUARTERLY,
        TimeGranularity.YEARLY,
        TimeGranularity.ROLLING,
    ],

    applicableTo: [
        ConceptType.HOTEL,
        ConceptType.CHAIN,
        ConceptType.DESTINATION,
        ConceptType.MARKET,
    ],

    supportedCapabilities: [
        CapabilityType.PERFORMANCE,
        CapabilityType.COMPARE,
        CapabilityType.DIAGNOSE,
        CapabilityType.RECOMMEND,
        CapabilityType.FORECAST,
        CapabilityType.INVESTIGATE,
        CapabilityType.PRIORITIZE,
    ],

    interpretation: {
        goodPerformance:
            "Revenue growth above market growth rate indicates TBO is gaining market share. " +
            "Consistent month-over-month revenue growth signals healthy business momentum " +
            "and strong competitive positioning.",

        poorPerformance:
            "Revenue decline or growth below market growth rate signals competitive loss " +
            "or volume erosion. Sustained revenue decline despite stable pricing typically " +
            "indicates a booking volume problem driven by win rate deterioration.",

        contextNote:
            "Evaluate revenue in context: total sales includes cancellations. " +
            "Vouchered (confirmed) revenue is the more reliable health indicator. " +
            "Always compare revenue trends to booking volume — revenue can increase " +
            "due to higher average booking values even when volume falls.",
    },
};

// ─── Metric: Market Share ─────────────────────────────────────────────────────
//
// Market share measures TBO's relative position within its competitive context.
// Unlike revenue (absolute), market share is relative — it tells you whether
// you are growing faster or slower than the market.

export const MARKET_SHARE_METRIC: BusinessMetric = {
    id:   metricId("MARKET_SHARE"),
    type: MetricType.MARKET_SHARE,
    name: "Market Share",

    description:
        "TBO's proportional share of total bookings or revenue within a given " +
        "competitive market, destination, or segment. Market share is the relative " +
        "position metric — it reveals whether TBO is growing its presence in a market " +
        "or losing ground to competitors, independent of whether the market itself is " +
        "growing or shrinking. A rising market share in a declining market is still " +
        "a positive competitive signal.",

    unit:     "percentage",
    polarity: MetricPolarity.HIGHER_IS_BETTER,

    synonyms: [
        "market share",
        "share",
        "share of market",
        "market position",
        "competitive share",
        "booking share",
        "volume share",
        "share of wallet",
    ],

    temporalScope: [
        TimeGranularity.MONTHLY,
        TimeGranularity.QUARTERLY,
        TimeGranularity.YEARLY,
        TimeGranularity.ROLLING,
    ],

    applicableTo: [
        ConceptType.HOTEL,
        ConceptType.CHAIN,
        ConceptType.DESTINATION,
        ConceptType.SUPPLIER,
        ConceptType.MARKET,
    ],

    supportedCapabilities: [
        CapabilityType.PERFORMANCE,
        CapabilityType.COMPARE,
        CapabilityType.DIAGNOSE,
        CapabilityType.RECOMMEND,
        CapabilityType.INVESTIGATE,
        CapabilityType.PRIORITIZE,
    ],

    interpretation: {
        goodPerformance:
            "Growing market share indicates TBO is outcompeting rivals and capturing " +
            "a larger proportion of the available booking volume. Share growth above " +
            "the market growth rate is the clearest signal of competitive advantage.",

        poorPerformance:
            "Declining market share signals that competitors are capturing bookings " +
            "that TBO is losing. Even in a growing market, share loss indicates " +
            "structural competitive weakness that will compound over time.",

        contextNote:
            "Market share is most meaningful at monthly granularity or coarser — " +
            "daily share figures are too volatile to drive strategic decisions. " +
            "Always assess share in context of whether the total market is growing " +
            "or contracting.",
    },
};

// ─── Metric: Volume ───────────────────────────────────────────────────────────
//
// Volume measures the count of business events — searches, bookings, vouchered
// bookings. It is the operational throughput metric that underpins revenue.

export const VOLUME_METRIC: BusinessMetric = {
    id:   metricId("VOLUME"),
    type: MetricType.VOLUME,
    name: "Volume",

    description:
        "The count of business events — searches, bookings, vouchered (completed) " +
        "bookings, or cancellations — processed within a time period. Volume is the " +
        "operational throughput metric. It answers 'how much activity?' before asking " +
        "'how efficiently?' Booking volume drives revenue; search volume measures " +
        "demand. Conversion rate (L2B) connects them: volume at each funnel stage " +
        "diagnoses where demand is leaking.",

    unit:     "count",
    polarity: MetricPolarity.HIGHER_IS_BETTER,

    synonyms: [
        "volume",
        "bookings",
        "booking volume",
        "searches",
        "search volume",
        "number of bookings",
        "total bookings",
        "booking count",
        "reservations",
        "transactions",
        "throughput",
        "activity",
        "count",
    ],

    temporalScope: [
        TimeGranularity.DAILY,
        TimeGranularity.WEEKLY,
        TimeGranularity.MONTHLY,
        TimeGranularity.QUARTERLY,
        TimeGranularity.YEARLY,
        TimeGranularity.ROLLING,
    ],

    applicableTo: [
        ConceptType.HOTEL,
        ConceptType.CHAIN,
        ConceptType.DESTINATION,
        ConceptType.SUPPLIER,
        ConceptType.MARKET,
        ConceptType.DATASET,
    ],

    supportedCapabilities: [
        CapabilityType.PERFORMANCE,
        CapabilityType.COMPARE,
        CapabilityType.DIAGNOSE,
        CapabilityType.FORECAST,
        CapabilityType.INVESTIGATE,
        CapabilityType.PRIORITIZE,
    ],

    interpretation: {
        goodPerformance:
            "Booking volume growing in line with or above search volume growth indicates " +
            "healthy conversion. Sustained volume growth without proportional revenue " +
            "growth suggests average booking value is declining (lower-tier properties " +
            "or shorter stays are driving growth).",

        poorPerformance:
            "Booking volume declining while search volume holds or grows signals a " +
            "conversion problem — demand exists but is not translating to bookings. " +
            "This typically indicates a pricing or availability issue.",

        contextNote:
            "Volume must be interpreted at the right funnel stage: searches → bookings → " +
            "vouchered bookings → net (cancellation-adjusted). Each ratio tells a " +
            "different story. Never evaluate booking volume in isolation.",
    },
};

// ─── Metric: Trend ────────────────────────────────────────────────────────────
//
// Trend is the meta-metric — it captures the directional movement of any other
// metric over time. Its polarity is CONTEXTUAL: whether a trend is good or bad
// depends entirely on which metric is trending and in which direction.

export const TREND_METRIC: BusinessMetric = {
    id:   metricId("TREND"),
    type: MetricType.TREND,
    name: "Trend",

    description:
        "The directional movement and momentum of a business metric over a defined " +
        "time period. Trend analysis answers 'where is this metric heading?' rather " +
        "than 'where is it now?'. It reveals acceleration or deceleration, seasonal " +
        "patterns, structural shifts, and early warning signals before they become " +
        "critical business problems. Trend is always interpreted in the context of " +
        "which underlying metric is being analyzed.",

    unit:     "directional change",
    polarity: MetricPolarity.CONTEXTUAL,

    synonyms: [
        "trend",
        "trajectory",
        "direction",
        "momentum",
        "movement",
        "change over time",
        "time series",
        "over time",
        "trending",
        "week over week",
        "month over month",
        "year over year",
        "wow",
        "mom",
        "yoy",
        "qoq",
        "historically",
        "history",
    ],

    // Trend requires at least weekly granularity to show meaningful patterns.
    // Daily trends are too noisy for executive decision-making.
    temporalScope: [
        TimeGranularity.WEEKLY,
        TimeGranularity.MONTHLY,
        TimeGranularity.QUARTERLY,
        TimeGranularity.YEARLY,
        TimeGranularity.ROLLING,
    ],

    applicableTo: [
        ConceptType.HOTEL,
        ConceptType.CHAIN,
        ConceptType.DESTINATION,
        ConceptType.SUPPLIER,
        ConceptType.MARKET,
    ],

    supportedCapabilities: [
        CapabilityType.PERFORMANCE,
        CapabilityType.DIAGNOSE,
        CapabilityType.EXPLAIN,
        CapabilityType.FORECAST,
        CapabilityType.INVESTIGATE,
    ],

    interpretation: {
        goodPerformance:
            "A positive trend in a HIGHER_IS_BETTER metric (e.g. win rate increasing " +
            "month-over-month) indicates improving competitive position. " +
            "Consistent directional improvement over 3+ periods is a strong signal " +
            "of sustainable business health.",

        poorPerformance:
            "A negative trend in a HIGHER_IS_BETTER metric (e.g. win rate declining " +
            "for 3 consecutive months) signals deteriorating competitive position. " +
            "The duration and rate of decline determine urgency of response.",

        contextNote:
            "Trend polarity is CONTEXTUAL — always evaluate trend direction relative to " +
            "the underlying metric's own polarity. A declining PRICE_GAP trend is " +
            "GOOD (we're becoming more price-competitive). A declining WIN_RATE trend " +
            "is BAD. The Business Reasoner must resolve context before interpreting.",
    },
};

// ─── Metric: Confidence ───────────────────────────────────────────────────────
//
// Confidence measures the statistical reliability of other metrics. It is
// a data quality signal — low confidence means conclusions drawn from other
// metrics should be treated as directional rather than definitive.

export const CONFIDENCE_METRIC: BusinessMetric = {
    id:   metricId("CONFIDENCE"),
    type: MetricType.CONFIDENCE,
    name: "Confidence",

    description:
        "A statistical reliability indicator measuring how trustworthy the other " +
        "metrics are for a given entity, time period, or market. Confidence reflects " +
        "the quantity and consistency of underlying observations. Low confidence means " +
        "the metric values are directional estimates rather than statistically robust " +
        "figures — decisions should not be taken on low-confidence data without " +
        "additional validation. High confidence enables firm executive conclusions.",

    unit:     "index",
    polarity: MetricPolarity.HIGHER_IS_BETTER,

    synonyms: [
        "confidence",
        "statistical confidence",
        "reliability",
        "data quality",
        "data confidence",
        "significance",
        "statistical significance",
        "observation count",
        "sample size",
        "data coverage",
    ],

    // Confidence is only meaningful at monthly granularity or coarser.
    // Daily confidence scores are meaningless — there aren't enough observations
    // per day per entity to compute a statistically valid confidence measure.
    temporalScope: [
        TimeGranularity.MONTHLY,
        TimeGranularity.QUARTERLY,
        TimeGranularity.YEARLY,
        TimeGranularity.ROLLING,
    ],

    applicableTo: [
        ConceptType.HOTEL,
        ConceptType.CHAIN,
        ConceptType.DESTINATION,
        ConceptType.MARKET,
        ConceptType.DATASET,
    ],

    supportedCapabilities: [
        CapabilityType.INVESTIGATE,
    ],

    interpretation: {
        goodPerformance:
            "High confidence (sufficient observation count) means metric values are " +
            "statistically robust and can support firm executive decisions. " +
            "A confidence-flagged metric at this level needs no qualification.",

        poorPerformance:
            "Low confidence signals insufficient data — the metric value may not be " +
            "representative. Decisions based on low-confidence metrics carry higher " +
            "risk and should be accompanied by a recommendation to gather more data " +
            "before acting.",

        contextNote:
            "Confidence is relative to entity volume. A small boutique hotel will " +
            "naturally have fewer observations than a major chain property. " +
            "Low confidence for small hotels is expected and does not imply a data problem. " +
            "Flag it and qualify the conclusion rather than suppressing the analysis.",
    },
};

// ─── Aggregated Export ────────────────────────────────────────────────────────

export const ALL_METRICS: BusinessMetric[] = [
    WIN_RATE_METRIC,
    PRICE_GAP_METRIC,
    REVENUE_METRIC,
    MARKET_SHARE_METRIC,
    VOLUME_METRIC,
    TREND_METRIC,
    CONFIDENCE_METRIC,
];
