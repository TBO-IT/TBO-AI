import { DatasetType } from "./datasetTypes.js";
import { SynonymEntry, DatasetMetricAvailability } from "./questionTypes.js";

// ─── Metric Synonym Registry ──────────────────────────────────────────────────
// Maps executive phrasing → canonical metric keys from METRIC_REGISTRY

export const METRIC_SYNONYMS: SynonymEntry[] = [
    {
        canonicalKey: "win_rate",
        type: "metric",
        synonyms: [
            "win rate", "win-rate", "winrate",
            "winning rate", "competitive performance", "competitiveness",
            "winning percentage", "win percentage",
            "how we are winning", "wins"
        ]
    },
    {
        canonicalKey: "avg_price_diff",
        type: "metric",
        synonyms: [
            "average price difference", "avg price diff", "price difference",
            "price gap", "average price gap", "mean price diff",
            "winning margin", "winning-margin", "losing margin", "losing-margin",
            "pricing gap", "markup"
        ]
    },
    {
        canonicalKey: "median_price_diff",
        type: "metric",
        synonyms: [
            "median price difference", "median price diff",
            "median price gap", "price diff median"
        ]
    },
    {
        canonicalKey: "l2b",
        type: "metric",
        synonyms: [
            "l2b", "look to book", "look-to-book", "look2book",
            "conversion rate", "booking conversion",
            "search to book", "search to booking",
            "booking rate", "convert rate"
        ]
    },
    {
        canonicalKey: "l2v",
        type: "metric",
        synonyms: [
            "l2v", "look to voucher", "look-to-voucher",
            "voucher rate", "voucher conversion"
        ]
    },
    {
        canonicalKey: "searches",
        type: "metric",
        synonyms: [
            "searches", "search volume", "number of searches",
            "total searches", "search count", "queries"
        ]
    },
    {
        canonicalKey: "bookings",
        type: "metric",
        synonyms: [
            "bookings", "total bookings", "number of bookings",
            "booking count", "reservations", "booking volume", "volume",
            "volume share", "volume-share"
        ]
    },
    {
        canonicalKey: "vouchered_bookings",
        type: "metric",
        synonyms: [
            "vouchered bookings", "completed bookings", "confirmed bookings",
            "vouchered", "net bookings"
        ]
    },
    {
        canonicalKey: "cancelled_bookings",
        type: "metric",
        synonyms: [
            "cancelled bookings", "cancellations", "booking cancellations",
            "cancelled reservations", "cancellation count"
        ]
    },
    {
        canonicalKey: "total_sales",
        type: "metric",
        synonyms: [
            "total sales", "gross sales", "revenue", "sales",
            "total revenue", "gross revenue", "booking value"
        ]
    },
    {
        canonicalKey: "vouchered_sales",
        type: "metric",
        synonyms: [
            "vouchered sales", "confirmed sales", "net sales",
            "completed sales revenue"
        ]
    },
    {
        canonicalKey: "cancel_sales",
        type: "metric",
        synonyms: [
            "cancel sales", "cancelled sales", "lost revenue",
            "cancellation revenue", "lost bookings value"
        ]
    }
];

// ─── Dimension Synonym Registry ───────────────────────────────────────────────

export const DIMENSION_SYNONYMS: SynonymEntry[] = [
    {
        canonicalKey: "destination",
        type: "dimension",
        synonyms: [
            "destination", "destinations",
            "market", "markets",
            "location", "locations",
            "place", "places",
            "region", "regions"
        ]
    },
    {
        canonicalKey: "city",
        type: "dimension",
        synonyms: [
            "city", "cities",
            "town", "towns"
        ]
    },
    {
        canonicalKey: "supplier",
        type: "dimension",
        synonyms: [
            "supplier", "suppliers",
            "provider", "providers",
            "vendor", "vendors",
            "ota", "otas",
            "competitor", "competitors",
            "channel", "channels",
            "third party", "third-party"
        ]
    },
    {
        canonicalKey: "hotel",
        type: "dimension",
        synonyms: [
            "hotel", "hotels",
            "property", "properties",
            "accommodation", "accommodations"
        ]
    },
    {
        canonicalKey: "chain",
        type: "dimension",
        synonyms: [
            "chain", "chains",
            "hotel chain", "hotel group",
            "brand", "brands",
            "group"
        ]
    },
    {
        canonicalKey: "country",
        type: "dimension",
        synonyms: [
            "country", "countries",
            "nation", "nations"
        ]
    },
    {
        canonicalKey: "apw",
        type: "dimension",
        synonyms: ["apw", "advanced purchase window",
            "purchase window", "lead time"
        ]
    },
    {
        canonicalKey: "contracting_manager",
        type: "dimension",
        synonyms: [
            "contracting manager", "contracting managers",
            "contract manager", "contract managers",
            "hotel manager", "hotel managers",
            "account manager", "account managers",
            "contracting lead", "contracting leads",
            "manager"
        ]
    }
];

// ─── Intent Signal Words ──────────────────────────────────────────────────────
// Keyword patterns used to detect analytical intent

export const INTENT_SIGNALS = {
    /**
     * CONTRIBUTION — dimension-member attribution queries.
     * CHECKED BEFORE ROOT_CAUSE in detectIntent().
     * Must NOT include outcome words (decline/drop) — those appear in contribution questions.
     */
    CONTRIBUTION: [
        "contribut",       // contribution, contributor, contributors, contributed
        "driver",          // driver, drivers
        "driving",
        "drove",
        "impact",          // impact, impacted, impacting
        "largest impact",
        "biggest impact",
        "most impact",
        "top contributor",
        "top negative",
        "top positive"
    ],

    /**
     * ROOT_CAUSE — genuine causal inquiry only.
     * IMPORTANT: "decline", "drop", "decrease", "increase", "growth" are intentionally
     * EXCLUDED. Those are outcome words that appear in contribution questions and must
     * not leak into the ROOT_CAUSE route.
     */
    ROOT_CAUSE: [
        "why did",
        "why does",
        "why is ",
        "why are",
        "why was",
        "why were",
        "root cause",
        "root-cause",
        "what caused",
        "what happened",
        "what went wrong",
        "explain the",
        "explain why",
        "explain how"
    ],

    TREND: [
        "trend", "over time",
        "month over month", "mom", "wow", "yoy", "qoq",
        "weekly", "monthly", "quarterly", "annually",
        "historically", "history",
        "trajectory", "time series"
    ],

    COMPARISON: [
        "compare", "comparison",
        "versus", " vs ", "vs.",
        "difference between", "contrast",
        "against", "relative to", "compared to",
        "side by side"
    ],

    RANKING: [
        "top", "bottom", "best", "worst",
        "highest", "lowest",
        "rank", "ranking",
        "leader", "lagging",
        "most", "least"
    ],

    CORRELATION: [
        "correlation", "correlate",
        "relationship", "linked", "associated",
        "impact of", "effect of"
    ],

    ANOMALY: [
        "anomaly", "anomalies",
        "unusual", "outlier", "outliers",
        "unexpected", "spike", "dip", "strange"
    ],

    BREAKDOWN: [
        "break down", "breakdown",
        "split by", "split",
        "segment", "segmented",
        "by", "across", "per"
    ],

    SUMMARY: [
        "overview", "summary", "summarize",
        "total", "overall", "all",
        "show me", "what is", "how much", "how many",
        "show", "list", "display", "give me", "give", "get"
    ],
    COMPETITOR_STRATEGY: [
        "beat",
        "outperform",
        "win against",
        "compete against",
        "competitor strategy",
        "versus competitor",
        "vs competitor"
    ],

    EXECUTIVE_PRIORITY: [
        "focus on first",
        "focus on",
        "highest roi",
        "fastest win",
        "hurting us most",
        "hurting us",
        "single most important",
        "only fix one thing",
        "allocate resources",
        "leadership should know",
        "biggest opportunity",
        "highest leverage",
        "what should we focus",
        "what should leadership",
        "where should i allocate",
        "where should we allocate",
        "what is hurting",
        "if we only fix"
    ]
};

// ─── Time Reference Signals ───────────────────────────────────────────────────

export const TIME_SIGNALS = [
    // Months
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
    // Quarters
    "q1", "q2", "q3", "q4",
    "first quarter", "second quarter", "third quarter", "fourth quarter",
    // Relative
    "last month", "this month", "last week", "this week",
    "last quarter", "this quarter", "last year", "this year",
    "yesterday", "today",
    "previous week", "past week", "previous month", "past month",
    "previous quarter", "past quarter", "previous year", "past year",
    // Comparison periods
    "month over month", "week over week", "year over year", "quarter over quarter",
    "month-over-month", "week-over-week", "year-over-year", "quarter-over-quarter",
    "mom", "wow", "yoy", "qoq",
    "w-o-w", "m-o-m", "y-o-y", "q-o-q"
];

// ─── Dataset Metric Availability ──────────────────────────────────────────────
// The single source of truth for which metrics belong to which dataset type

export const DATASET_METRIC_AVAILABILITY: DatasetMetricAvailability = {
    [DatasetType.COMPETITIVENESS]: ["win_rate", "avg_price_diff", "median_price_diff"],
    [DatasetType.CONVERSION]: [
        "searches", "bookings", "vouchered_bookings", "cancelled_bookings",
        "total_sales", "vouchered_sales", "cancel_sales", "l2b", "l2v"
    ],
    [DatasetType.REVENUE]: ["total_sales", "vouchered_sales", "cancel_sales"],
    [DatasetType.UNKNOWN]: []
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function normalizeMetric(text: string): string | null {
    const normalized = text.toLowerCase().trim();
    for (const entry of METRIC_SYNONYMS) {
        if (entry.synonyms.includes(normalized)) {
            return entry.canonicalKey;
        }
    }
    return null;
}

export function normalizeDimension(text: string): string | null {
    const normalized = text.toLowerCase().trim();
    for (const entry of DIMENSION_SYNONYMS) {
        if (entry.synonyms.includes(normalized)) {
            return entry.canonicalKey;
        }
    }
    return null;
}
