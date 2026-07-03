// ─────────────────────────────────────────────────────────────────────────────
// types.ts
//
// WHY THIS FILE EXISTS:
//   This is the single vocabulary file for the entire Business Ontology layer.
//   Every enum, branded type, and factory helper lives here so that:
//     (a) imports are predictable — all domain vocabulary comes from one place,
//     (b) the TypeScript compiler enforces category correctness across the whole
//         intelligence layer, and
//     (c) adding a new industry (e.g. retail, logistics) only requires extending
//         these enums — no interfaces need to change.
//
// RESPONSIBILITY:
//   Defines the closed vocabulary of the ontology:
//     - What kinds of business concepts exist        (ConceptType)
//     - What kinds of business metrics exist         (MetricType)
//     - What analytical operations are supported     (CapabilityType)
//     - How concepts relate to one another           (RelationshipType)
//     - How metrics should be directionally read     (MetricPolarity)
//     - At what temporal resolution metrics apply    (TimeGranularity)
//     - What categories of evidence capabilities need (EvidenceKind)
//     - Compile-time-safe ID types                  (ConceptId, MetricId, CapabilityId)
//
// DESIGN DECISIONS:
//   - All enums use string values (not numeric) for serialization safety and
//     debuggability — log output is human-readable without a reverse-map.
//   - Branded ID types use a phantom `__brand` property. This property never
//     exists at runtime (TypeScript structural typing erases it), but the
//     compiler uses it to reject category mix-ups (e.g. passing a MetricId
//     where a ConceptId is expected). This is the safest pattern that avoids
//     class-based wrappers while still providing compile-time guarantees.
//   - Factory helpers (`conceptId`, `metricId`, `capabilityId`) are the ONLY
//     sanctioned way to create branded IDs. They centralize the unsafe cast
//     and document intent at every call site.
//
// FUTURE EXTENSIBILITY:
//   - To add a new industry: extend ConceptType with new entity kinds.
//   - To add a new analytical capability: extend CapabilityType and EvidenceKind.
//   - To add a new evidence collection strategy: extend EvidenceKind; the
//     EvidencePlanner will dispatch on the new value without touching any
//     other ontology file.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Concept Types ────────────────────────────────────────────────────────────
//
// Fundamental categories of business entities.
// These are domain-level categories, not database table names.
//
// Intentionally generic:
//   HOTEL       → "Any bookable accommodation unit" (hospitality)
//   CHAIN       → "A brand or management group" (hospitality / retail franchise)
//   DESTINATION → "A geographic market" (hospitality / travel / logistics)
//   SUPPLIER    → "An external provider of inventory or service" (any industry)
//   MARKET      → "An aggregate competitive context" (any industry)
//   DATASET     → "A named analytical data source" (any industry)

export enum ConceptType {
    HOTEL = "HOTEL",
    CHAIN = "CHAIN",
    DESTINATION = "DESTINATION",
    SUPPLIER = "SUPPLIER",
    MARKET = "MARKET",
    DATASET = "DATASET",
}

// ─── Metric Types ─────────────────────────────────────────────────────────────
//
// Semantic categories of business measurements.
//
// CRITICAL DESIGN NOTE:
//   These are NOT SQL column names, DuckDB formula labels, or API response keys.
//   WIN_RATE is the business concept "percentage of competitive interactions we win".
//   It does not reference how win rate is calculated, stored, or retrieved.
//   The calculation lives in metricRegistry.ts (infrastructure).
//   The meaning lives here (domain).

export enum MetricType {
    WIN_RATE = "WIN_RATE",
    PRICE_GAP = "PRICE_GAP",
    REVENUE = "REVENUE",
    MARKET_SHARE = "MARKET_SHARE",
    VOLUME = "VOLUME",
    TREND = "TREND",
    CONFIDENCE = "CONFIDENCE",
}

// ─── Capability Types ─────────────────────────────────────────────────────────
//
// The analytical operations the system can perform on business concepts.
// Each capability maps to a distinct reasoning mode that the Business Reasoner
// and Consulting Engine will invoke.
//
// PERFORMANCE  → "How are we doing on this metric for this entity?"
// COMPARE      → "How does entity A compare to entity B on this metric?"
// DIAGNOSE     → "Why is this metric at this level? What is driving it?"
// EXPLAIN      → "What caused this specific change in this metric?"
// RECOMMEND    → "What actions should be taken to improve this metric?"
// FORECAST     → "What will this metric look like in the future?"
// INVESTIGATE  → "Deep-dive: find anomalies, outliers, unexpected patterns."
// PRIORITIZE   → "Which entities or actions deserve the most attention first?"

export enum CapabilityType {
    PERFORMANCE = "PERFORMANCE",
    TREND = "TREND",
    COMPARE = "COMPARE",
    DIAGNOSE = "DIAGNOSE",
    EXPLAIN = "EXPLAIN",
    RECOMMEND = "RECOMMEND",
    FORECAST = "FORECAST",
    INVESTIGATE = "INVESTIGATE",
    PRIORITIZE = "PRIORITIZE",
}

// ─── Relationship Types ───────────────────────────────────────────────────────
//
// Semantic verbs describing directional relationships between concepts.
// These are the edge labels of the ontology graph.
//
// Designed to be read as natural-language statements:
//   Hotel BELONGS_TO Chain
//   Chain OPERATES_IN Destination
//   Supplier COMPETES_WITH Supplier
//
// BELONGS_TO     → Hierarchical membership (many-to-one, non-symmetric)
// OPERATES_IN    → Geographic/market presence (many-to-many)
// SUPPLIED_BY    → Inventory provisioning relationship (many-to-many)
// AFFECTS        → Causal influence, non-directional (many-to-many)
// MEASURED_BY    → A concept is quantified by a metric (many-to-many)
// COMPETES_WITH  → Market competition (many-to-many, symmetric/bidirectional)
// PART_OF        → Structural containment (many-to-one, non-symmetric)
// INFLUENCES     → Soft causal relationship, less direct than AFFECTS
// OWNED_BY       → Legal or operational ownership (many-to-one)
// CATEGORIZED_AS → Classification into a segment or category (many-to-many)

export enum RelationshipType {
    BELONGS_TO = "BELONGS_TO",
    OPERATES_IN = "OPERATES_IN",
    SUPPLIED_BY = "SUPPLIED_BY",
    AFFECTS = "AFFECTS",
    MEASURED_BY = "MEASURED_BY",
    COMPETES_WITH = "COMPETES_WITH",
    PART_OF = "PART_OF",
    INFLUENCES = "INFLUENCES",
    OWNED_BY = "OWNED_BY",
    CATEGORIZED_AS = "CATEGORIZED_AS",
}

// ─── Metric Polarity ──────────────────────────────────────────────────────────
//
// Describes the direction in which a metric value indicates better performance.
//
// WHY THREE STATES INSTEAD OF A BOOLEAN:
//   `higherIsBetter: boolean` forces binary thinking.
//   TREND is neither — whether an increasing trend is good depends entirely on
//   *which* metric is trending. A rising PRICE_GAP trend is bad. A rising
//   WIN_RATE trend is good. TREND itself is CONTEXTUAL.
//   CONFIDENCE is HIGHER_IS_BETTER — more confident data is always better.
//
// The Business Reasoner uses polarity to:
//   - Automatically determine if a metric value is healthy without hardcoding rules.
//   - Correctly frame metric changes in narrative outputs ("improved" vs "worsened").

export enum MetricPolarity {
    HIGHER_IS_BETTER = "HIGHER_IS_BETTER",
    LOWER_IS_BETTER = "LOWER_IS_BETTER",
    CONTEXTUAL = "CONTEXTUAL",
}

// ─── Time Granularity ────────────────────────────────────────────────────────
//
// The temporal resolutions at which a metric carries analytical meaning.
//
// WHY THIS EXISTS ON THE METRIC (not the query):
//   CONFIDENCE is unreliable at DAILY granularity — there may not be enough
//   observations per day for statistical significance. Encoding this on the
//   metric definition lets the Evidence Planner enforce appropriate aggregation
//   levels automatically, without baking this logic into each query template.
//
// ROLLING → trailing window (e.g. 28-day rolling average), distinct from WEEKLY
//   because rolling windows do not align to calendar week boundaries.

export enum TimeGranularity {
    DAILY = "DAILY",
    WEEKLY = "WEEKLY",
    MONTHLY = "MONTHLY",
    QUARTERLY = "QUARTERLY",
    YEARLY = "YEARLY",
    ROLLING = "ROLLING",
}

// ─── Evidence Kinds ───────────────────────────────────────────────────────────
//
// Typed categories of evidence that a BusinessCapability requires.
//
// WHY AN ENUM INSTEAD OF strings[]:
//   The future EvidencePlanner dispatches SQL collection strategies based on
//   EvidenceKind values. If kinds were strings, a typo ("TREND_SERIE" vs
//   "TREND_SERIES") would cause a silent no-op at collection time. Enum values
//   are compiler-checked at every reference site.
//
// Each EvidenceKind maps to a distinct collection strategy:
//   TREND_SERIES         → time-bucketed aggregate SQL grouped by date
//   COMPARATIVE_SNAPSHOT → single-period aggregate grouped by entity dimension
//   ENTITY_BREAKDOWN     → multi-level GROUP BY with metric values per entity
//   RANKING_TABLE        → ORDER BY metric DESC/ASC with LIMIT
//   ANOMALY_DETECTION    → statistical deviation or Z-score query
//   CAUSAL_TRACE         → correlated metric time series for root-cause analysis
//   FORECAST_PROJECTION  → extrapolation from historical trend data
//   AGGREGATE_SUMMARY    → top-level SUM/AVG/COUNT without grouping
//   MARKET_CONTEXT       → cross-dataset benchmark or market-level roll-up
//   CONFIDENCE_SIGNAL    → observation counts and data density indicators

export enum EvidenceKind {
    TREND_SERIES = "TREND_SERIES",
    COMPARATIVE_SNAPSHOT = "COMPARATIVE_SNAPSHOT",
    ENTITY_BREAKDOWN = "ENTITY_BREAKDOWN",
    RANKING_TABLE = "RANKING_TABLE",
    ANOMALY_DETECTION = "ANOMALY_DETECTION",
    CAUSAL_TRACE = "CAUSAL_TRACE",
    FORECAST_PROJECTION = "FORECAST_PROJECTION",
    AGGREGATE_SUMMARY = "AGGREGATE_SUMMARY",
    MARKET_CONTEXT = "MARKET_CONTEXT",
    CONFIDENCE_SIGNAL = "CONFIDENCE_SIGNAL",
}

// ─── Branded ID Types ─────────────────────────────────────────────────────────
//
// Phantom-brand pattern: a structural intersection with a never-instantiated
// object type. The `__brand` property only exists in the type system — it has
// zero runtime overhead. TypeScript uses it to distinguish these types from
// plain `string` and from each other.
//
// Without branding:
//   registerConcept(metricId)  // TypeScript: OK. Runtime: broken silently.
//
// With branding:
//   registerConcept(metricId)  // TypeScript: ERROR. Caught at compile time.
//
// This pattern is especially important as the registry grows to hundreds of
// entries across multiple industries — the surface area for ID category errors
// grows proportionally without this protection.

export type ConceptId = string & { readonly __brand: "ConceptId" };
export type MetricId = string & { readonly __brand: "MetricId" };
export type CapabilityId = string & { readonly __brand: "CapabilityId" };

// ─── Branded ID Factory Helpers ───────────────────────────────────────────────
//
// These are the ONLY sanctioned way to produce branded IDs.
// They centralize the unsafe `as` cast and make intent explicit at call sites.
//
// Usage in data files:
//   const WIN_RATE_ID = metricId("WIN_RATE");
//
// Usage in tests and future components:
//   const metric = registry.getMetric(metricId("WIN_RATE"));

export function conceptId(id: string): ConceptId { return id as ConceptId; }
export function metricId(id: string): MetricId { return id as MetricId; }
export function capabilityId(id: string): CapabilityId { return id as CapabilityId; }

// ─── Ontology Summary ────────────────────────────────────────────────────────
//
// A read-only snapshot of the registry's contents.
// Returned by OntologyRegistry.getSummary() for diagnostics, health checks,
// and future admin/introspection endpoints.
// Does NOT expose the internal maps — consumers get counts and type lists only.

export interface OntologySummary {
    readonly conceptCount: number;
    readonly metricCount: number;
    readonly capabilityCount: number;
    readonly relationshipCount: number;
    readonly isSealed: boolean;
    readonly conceptTypes: readonly ConceptType[];
    readonly metricTypes: readonly MetricType[];
    readonly capabilityTypes: readonly CapabilityType[];
}