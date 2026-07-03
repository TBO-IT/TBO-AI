// ─────────────────────────────────────────────────────────────────────────────
// data/relationships.ts
//
// WHY THIS FILE EXISTS:
//   This file defines the edges of the hospitality ontology graph — the
//   structured, typed relationships between the six business concepts.
//   Without relationships, the ontology is a flat collection of isolated concepts.
//   Relationships give it graph structure that enables the Business Reasoner to
//   traverse "Hotel → Chain → Destination" chains and understand how business
//   entities connect to one another.
//
// RESPONSIBILITY:
//   Export all hospitality business relationships as fully-typed
//   `BusinessRelationship` objects. Each relationship is a directional,
//   labeled, semantically described edge in the concept graph.
//
// DESIGN DECISIONS:
//   - All ConceptId references use the `conceptId()` factory helper.
//     This ensures compile-time branded type safety — the compiler will reject
//     any MetricId or CapabilityId mistakenly passed as a concept reference.
//
//   - ID convention: "{SOURCE}__{TYPE}__{TARGET}".
//     This makes relationships self-describing in logs, debug output, and
//     any future serialization format. It also makes deduplication trivial.
//
//   - COMPETES_WITH is `isBidirectional: true` and uses cardinality MANY_TO_MANY.
//     The registry handles bidirectionality in its traversal methods — we only
//     register it once (A→B) and the registry automatically returns it for
//     both `getRelationshipsFrom(A)` and `getRelationshipsTo(B)`.
//
//   - MARKET PART_OF DESTINATION uses MANY_TO_ONE cardinality.
//     A market segment (e.g. "luxury hotels in Bangkok") is part of a destination
//     (Bangkok), but many such segments exist within one destination.
//
//   - Descriptions are written in business language, explaining the implication
//     of the relationship for analysis — not just restating the edge label.
//
// FUTURE EXTENSIBILITY:
//   - Add SEGMENT_OF relationships when hotel star-category concepts are added.
//   - Add COMPETES_IN (Hotel COMPETES_IN Destination) for market-scoped competition.
//   - Add temporal relationships (e.g. SEASONALLY_DOMINANT) when temporal ontology
//     extensions are built.
// ─────────────────────────────────────────────────────────────────────────────

import { BusinessRelationship } from "../BusinessRelationship.js";
import { RelationshipType, conceptId } from "../types.js";

// ─── HOTEL → CHAIN ────────────────────────────────────────────────────────────

export const HOTEL_BELONGS_TO_CHAIN: BusinessRelationship = {
    id:     "HOTEL__BELONGS_TO__CHAIN",
    source: conceptId("HOTEL"),
    target: conceptId("CHAIN"),
    type:   RelationshipType.BELONGS_TO,
    label:  "belongs to",

    description:
        "A hotel operates under the brand, distribution agreements, rate standards, " +
        "and commercial frameworks of a hotel chain. This relationship enables " +
        "chain-level performance roll-ups: the win rate, revenue, and volume of " +
        "all hotels belonging to a chain aggregate into chain-level KPIs. " +
        "Understanding this relationship is essential for portfolio analysis — " +
        "a chain's average win rate masks the distribution across individual properties.",

    cardinality:     "MANY_TO_ONE",
    isBidirectional: false,
};

export const HOTEL_OPERATED_BY_CHAIN: BusinessRelationship = {
    id:     "CHAIN__OPERATES__HOTEL",
    source: conceptId("CHAIN"),
    target: conceptId("HOTEL"),
    type:   RelationshipType.OPERATES_IN,
    label:  "operates",

    description:
        "A hotel chain manages and operates a portfolio of hotel properties. " +
        "This relationship is the reverse of HOTEL BELONGS_TO CHAIN and is used " +
        "by the Reasoner when traversing from chain to its constituent hotels — " +
        "for example, when diagnosing which hotels in a chain are dragging down " +
        "the overall chain win rate.",

    cardinality:     "ONE_TO_MANY",
    isBidirectional: false,
};

// ─── HOTEL → DESTINATION ──────────────────────────────────────────────────────

export const HOTEL_OPERATES_IN_DESTINATION: BusinessRelationship = {
    id:     "HOTEL__OPERATES_IN__DESTINATION",
    source: conceptId("HOTEL"),
    target: conceptId("DESTINATION"),
    type:   RelationshipType.OPERATES_IN,
    label:  "operates in",

    description:
        "A hotel is physically located in and commercially operates within a " +
        "destination market. This relationship allows the Reasoner to aggregate " +
        "hotel performance up to destination level, or to filter hotels within " +
        "a destination when analyzing a specific market. A hotel's competitive " +
        "position is always contextualized within its destination's norms.",

    cardinality:     "MANY_TO_ONE",
    isBidirectional: false,
};

// ─── CHAIN → DESTINATION ──────────────────────────────────────────────────────

export const CHAIN_OPERATES_IN_DESTINATION: BusinessRelationship = {
    id:     "CHAIN__OPERATES_IN__DESTINATION",
    source: conceptId("CHAIN"),
    target: conceptId("DESTINATION"),
    type:   RelationshipType.OPERATES_IN,
    label:  "operates in",

    description:
        "A hotel chain has commercial presence in one or more destination markets. " +
        "This relationship enables questions like: 'In which destinations is Marriott " +
        "most competitive?' or 'Which chains are losing ground in Bangkok?'. " +
        "Chain-destination analysis reveals strategic geographic concentration " +
        "and destination-specific brand strength.",

    cardinality:     "MANY_TO_MANY",
    isBidirectional: false,
};

// ─── HOTEL → SUPPLIER ─────────────────────────────────────────────────────────

export const HOTEL_SUPPLIED_BY_SUPPLIER: BusinessRelationship = {
    id:     "HOTEL__SUPPLIED_BY__SUPPLIER",
    source: conceptId("HOTEL"),
    target: conceptId("SUPPLIER"),
    type:   RelationshipType.SUPPLIED_BY,
    label:  "is compared against",

    description:
        "A hotel's prices are directly compared against one or more supplier prices " +
        "in competitive observations. The hotel's win rate is calculated by comparing " +
        "TBO's price against each supplier's price for the same hotel. This relationship " +
        "drives the core competitiveness analysis: which suppliers are TBO most often " +
        "losing to on which hotels?",

    cardinality:     "MANY_TO_MANY",
    isBidirectional: false,
};

// ─── SUPPLIER → MARKET ────────────────────────────────────────────────────────

export const SUPPLIER_AFFECTS_MARKET: BusinessRelationship = {
    id:     "SUPPLIER__AFFECTS__MARKET",
    source: conceptId("SUPPLIER"),
    target: conceptId("MARKET"),
    type:   RelationshipType.AFFECTS,
    label:  "affects",

    description:
        "A supplier's pricing strategy and market presence directly influences " +
        "the competitive dynamics of the markets in which it operates. When a major " +
        "supplier like Booking.com aggressively prices down in a market, TBO's " +
        "overall market win rate in that segment deteriorates. Understanding which " +
        "suppliers affect which markets quantifies the competitive threat landscape.",

    cardinality:     "MANY_TO_MANY",
    isBidirectional: false,
};

// ─── SUPPLIER → DESTINATION ───────────────────────────────────────────────────

export const SUPPLIER_OPERATES_IN_DESTINATION: BusinessRelationship = {
    id:     "SUPPLIER__OPERATES_IN__DESTINATION",
    source: conceptId("SUPPLIER"),
    target: conceptId("DESTINATION"),
    type:   RelationshipType.OPERATES_IN,
    label:  "operates in",

    description:
        "A supplier competes for hotel bookings in one or more destination markets. " +
        "Not all suppliers are active in all destinations — a regional OTA may only " +
        "operate in Southeast Asia, while a global OTA like Booking.com is present " +
        "everywhere. Understanding which suppliers are active in which destinations " +
        "scopes competitive analysis to relevant rivals only.",

    cardinality:     "MANY_TO_MANY",
    isBidirectional: false,
};

// ─── SUPPLIER → SUPPLIER ──────────────────────────────────────────────────────

export const SUPPLIER_COMPETES_WITH_SUPPLIER: BusinessRelationship = {
    id:              "SUPPLIER__COMPETES_WITH__SUPPLIER",
    source:          conceptId("SUPPLIER"),
    target:          conceptId("SUPPLIER"),
    type:            RelationshipType.COMPETES_WITH,
    label:           "competes with",

    description:
        "Suppliers compete with each other for the same hotel booking volume. " +
        "While TBO competes against all suppliers, suppliers also compete amongst " +
        "themselves — understanding inter-supplier competitive dynamics reveals " +
        "consolidation risks (if two large competitors merge), market structure, " +
        "and the total competitive intensity TBO faces in any given market. " +
        "This is a self-referential relationship on the SUPPLIER concept.",

    cardinality:     "MANY_TO_MANY",
    isBidirectional: true,
};

// ─── MARKET → DESTINATION ────────────────────────────────────────────────────

export const MARKET_PART_OF_DESTINATION: BusinessRelationship = {
    id:     "MARKET__PART_OF__DESTINATION",
    source: conceptId("MARKET"),
    target: conceptId("DESTINATION"),
    type:   RelationshipType.PART_OF,
    label:  "is part of",

    description:
        "A market segment (e.g. luxury hotels in Bangkok, budget properties in Phuket) " +
        "is a sub-segment of a broader destination. Multiple distinct market segments " +
        "coexist within a single destination and may have very different competitive " +
        "dynamics — the luxury segment in Bangkok may have a 70% win rate while the " +
        "budget segment has only 45%. Aggregating to destination level hides this nuance.",

    cardinality:     "MANY_TO_ONE",
    isBidirectional: false,
};

// ─── DESTINATION → MARKET ────────────────────────────────────────────────────

export const DESTINATION_INFLUENCES_MARKET: BusinessRelationship = {
    id:     "DESTINATION__INFLUENCES__MARKET",
    source: conceptId("DESTINATION"),
    target: conceptId("MARKET"),
    type:   RelationshipType.INFLUENCES,
    label:  "shapes",

    description:
        "A destination's macro characteristics — tourism demand, regulatory environment, " +
        "currency dynamics, and seasonal patterns — shape the competitive conditions " +
        "of all market segments operating within it. A destination experiencing a " +
        "tourism boom will see volume increase across all markets; a geopolitical " +
        "event suppressing demand will compress all segments simultaneously.",

    cardinality:     "ONE_TO_MANY",
    isBidirectional: false,
};

// ─── CHAIN → HOTEL ───────────────────────────────────────────────────────────

export const CHAIN_OWNS_HOTEL: BusinessRelationship = {
    id:     "CHAIN__OWNED_BY__HOTEL",
    source: conceptId("HOTEL"),
    target: conceptId("CHAIN"),
    type:   RelationshipType.OWNED_BY,
    label:  "owned by",

    description:
        "A hotel may be legally owned by a chain (as an asset) or simply managed " +
        "under a chain's brand through a franchise or management contract. " +
        "This OWNED_BY relationship captures the legal/asset ownership distinction, " +
        "which is separate from the BELONGS_TO brand affiliation. Owned hotels " +
        "may have different pricing authority and rate-setting mechanisms than " +
        "franchised properties — relevant for root-cause analysis of pricing anomalies.",

    cardinality:     "MANY_TO_ONE",
    isBidirectional: false,
};

// ─── Aggregated Export ────────────────────────────────────────────────────────

export const ALL_RELATIONSHIPS: BusinessRelationship[] = [
    HOTEL_BELONGS_TO_CHAIN,
    HOTEL_OPERATED_BY_CHAIN,
    HOTEL_OPERATES_IN_DESTINATION,
    CHAIN_OPERATES_IN_DESTINATION,
    HOTEL_SUPPLIED_BY_SUPPLIER,
    SUPPLIER_AFFECTS_MARKET,
    SUPPLIER_OPERATES_IN_DESTINATION,
    SUPPLIER_COMPETES_WITH_SUPPLIER,
    MARKET_PART_OF_DESTINATION,
    DESTINATION_INFLUENCES_MARKET,
    CHAIN_OWNS_HOTEL,
];
