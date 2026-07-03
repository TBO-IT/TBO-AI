// ─────────────────────────────────────────────────────────────────────────────
// data/concepts.ts
//
// WHY THIS FILE EXISTS:
//   This file contains the hospitality industry's concrete concept definitions —
//   the six named business entities that the platform reasons about.
//   It is the "data layer" of the ontology: pure configuration, no logic.
//
// RESPONSIBILITY:
//   Export six fully-populated `BusinessConcept` objects, one per ConceptType,
//   capturing the business knowledge that was previously scattered across:
//     - `businessKnowledge.ts`     (thin concept descriptions)
//     - `questionKnowledge.ts`     (synonym arrays for dimensions)
//     - `dimensionRegistry.ts`     (canonical key vocabulary)
//
//   The synonyms here supersede the `DIMENSION_SYNONYMS` in `questionKnowledge.ts`
//   as the authoritative business-level synonym list. The future Entity Resolver
//   will query the registry via `findConceptBySynonym()` instead of iterating
//   the `DIMENSION_SYNONYMS` array directly.
//
// DESIGN DECISIONS:
//   - All IDs use factory helpers (`conceptId`, `metricId`, `capabilityId`)
//     so the compiler enforces branded type correctness at this call site.
//   - `applicableMetrics` and `supportedCapabilities` are lists of IDs, not
//     objects. The registry resolves IDs to full objects at query time.
//   - Synonyms are lowercase, singular-first (matching normalization in registry).
//   - DATASET intentionally has the fewest metrics and capabilities — it is a
//     meta-entity representing a data source, not a business object you forecast.
//
// FUTURE EXTENSIBILITY:
//   - Add new concepts by appending to this file (no other file needs to change).
//   - Create parallel files for other industries (e.g. `retail-concepts.ts`)
//     and pass them to a separate bootstrap function.
//   - Add `parentConceptId` when concept hierarchies are needed (e.g. luxury vs budget hotel).
// ─────────────────────────────────────────────────────────────────────────────

import { BusinessConcept } from "../BusinessConcept.js";
import {
    ConceptType,
    conceptId,
    metricId,
    capabilityId,
} from "../types.js";

// ─── Concept: Hotel ───────────────────────────────────────────────────────────
//
// A hotel is the atomic unit of the hospitality business — the individual
// bookable property. Most competitive analysis, pricing decisions, and
// performance review happens at the hotel level.

export const HOTEL_CONCEPT: BusinessConcept = {
    id:   conceptId("HOTEL"),
    type: ConceptType.HOTEL,
    name: "Hotel",

    description:
        "A bookable accommodation property — the fundamental unit of the hospitality " +
        "business. Hotels generate revenue through room bookings, and their competitive " +
        "position is measured by win rate against other suppliers, pricing relative to " +
        "competitors, and booking volume trends. Analysis at the hotel level reveals " +
        "property-specific pricing problems, performance outliers, and booking opportunities.",

    synonyms: [
        "hotel",
        "hotels",
        "property",
        "properties",
        "accommodation",
        "accommodations",
        "lodging",
        "resort",
        "resorts",
        "venue",
        "venues",
    ],

    // Hotel is measurable by all 7 ontology metrics.
    // It is the most analytically rich concept — pricing, competitiveness, volume,
    // and revenue all have direct meaning at the individual property level.
    applicableMetrics: [
        metricId("WIN_RATE"),
        metricId("PRICE_GAP"),
        metricId("REVENUE"),
        metricId("MARKET_SHARE"),
        metricId("VOLUME"),
        metricId("TREND"),
        metricId("CONFIDENCE"),
    ],

    // Hotels support all 8 capabilities — they are the primary analytical target.
    supportedCapabilities: [
        capabilityId("PERFORMANCE"),
        capabilityId("COMPARE"),
        capabilityId("DIAGNOSE"),
        capabilityId("EXPLAIN"),
        capabilityId("RECOMMEND"),
        capabilityId("FORECAST"),
        capabilityId("INVESTIGATE"),
        capabilityId("PRIORITIZE"),
    ],
};

// ─── Concept: Chain ───────────────────────────────────────────────────────────
//
// A chain is a brand or management group that operates multiple hotels.
// Analysis at the chain level reveals brand-wide pricing strategy, portfolio
// performance, and cross-property patterns that are invisible at the hotel level.

export const CHAIN_CONCEPT: BusinessConcept = {
    id:   conceptId("CHAIN"),
    type: ConceptType.CHAIN,
    name: "Hotel Chain",

    description:
        "A brand or management group that operates multiple hotel properties under a " +
        "shared identity, pricing strategy, and commercial model. Chain-level analysis " +
        "reveals brand-wide competitive position, portfolio pricing consistency, and " +
        "aggregate market share. Executives use chain analysis to identify which brands " +
        "are winning or losing across portfolios and destinations.",

    synonyms: [
        "chain",
        "chains",
        "hotel chain",
        "hotel group",
        "hotel brand",
        "brand",
        "brands",
        "group",
        "groups",
        "portfolio",
        "operator",
        "management company",
    ],

    // Chains don't have individual PRICE_GAP or granular CONFIDENCE — these are
    // more meaningful at hotel level. Chains support WIN_RATE, REVENUE, MARKET_SHARE,
    // VOLUME, and TREND as aggregate roll-ups.
    applicableMetrics: [
        metricId("WIN_RATE"),
        metricId("REVENUE"),
        metricId("MARKET_SHARE"),
        metricId("VOLUME"),
        metricId("TREND"),
    ],

    // FORECAST and EXPLAIN are less reliable at the chain level because chain-level
    // changes are confounded by individual hotel changes within the portfolio.
    // The chain supports PERFORMANCE, COMPARE, DIAGNOSE, RECOMMEND, INVESTIGATE, PRIORITIZE.
    supportedCapabilities: [
        capabilityId("PERFORMANCE"),
        capabilityId("COMPARE"),
        capabilityId("DIAGNOSE"),
        capabilityId("RECOMMEND"),
        capabilityId("INVESTIGATE"),
        capabilityId("PRIORITIZE"),
    ],
};

// ─── Concept: Destination ─────────────────────────────────────────────────────
//
// A destination is a geographic market — the context in which hotels compete.
// Destination analysis reveals market-level demand, competitive dynamics, and
// pricing patterns that transcend individual properties or chains.

export const DESTINATION_CONCEPT: BusinessConcept = {
    id:   conceptId("DESTINATION"),
    type: ConceptType.DESTINATION,
    name: "Destination",

    description:
        "A geographic travel market where hotels compete for customer bookings. " +
        "Destinations aggregate the competitive and commercial activity of all hotels " +
        "and suppliers operating within a specific location (city, region, or country). " +
        "Destination-level analysis reveals market demand trends, competitive intensity, " +
        "pricing norms, and opportunity sizing for strategic resource allocation.",

    synonyms: [
        "destination",
        "destinations",
        "market",
        "markets",
        "location",
        "locations",
        "place",
        "places",
        "region",
        "regions",
        "city",
        "cities",
        "country",
        "countries",
        "territory",
        "territories",
        "area",
        "areas",
    ],

    applicableMetrics: [
        metricId("WIN_RATE"),
        metricId("PRICE_GAP"),
        metricId("REVENUE"),
        metricId("MARKET_SHARE"),
        metricId("VOLUME"),
        metricId("TREND"),
    ],

    supportedCapabilities: [
        capabilityId("PERFORMANCE"),
        capabilityId("COMPARE"),
        capabilityId("DIAGNOSE"),
        capabilityId("EXPLAIN"),
        capabilityId("RECOMMEND"),
        capabilityId("FORECAST"),
        capabilityId("INVESTIGATE"),
        capabilityId("PRIORITIZE"),
    ],
};

// ─── Concept: Supplier ────────────────────────────────────────────────────────
//
// A supplier is an external provider of hotel inventory — a competitor in the
// booking channel. Analysis at the supplier level reveals who is winning against
// us, by how much, and in which markets or properties.

export const SUPPLIER_CONCEPT: BusinessConcept = {
    id:   conceptId("SUPPLIER"),
    type: ConceptType.SUPPLIER,
    name: "Supplier",

    description:
        "An external provider of hotel room inventory — an Online Travel Agency (OTA), " +
        "competitor booking channel, or third-party supplier. Suppliers compete for the " +
        "same hotel bookings and their pricing directly drives our win or loss in each " +
        "competitive observation. Supplier analysis reveals who our most dangerous " +
        "competitors are, in which markets, and at what price differentials.",

    synonyms: [
        "supplier",
        "suppliers",
        "ota",
        "otas",
        "online travel agency",
        "competitor",
        "competitors",
        "channel",
        "channels",
        "provider",
        "providers",
        "vendor",
        "vendors",
        "third party",
        "third-party",
        "third parties",
        "booking channel",
    ],

    // Supplier-level REVENUE and MARKET_SHARE are derived from TBO's perspective
    // (how much market they take from us), not the supplier's own financials.
    applicableMetrics: [
        metricId("WIN_RATE"),
        metricId("PRICE_GAP"),
        metricId("MARKET_SHARE"),
        metricId("VOLUME"),
        metricId("TREND"),
    ],

    // FORECAST and RECOMMEND require too many assumptions about competitor behavior.
    // EXPLAIN is valid: "Why did Booking.com win more in Pattaya last month?"
    supportedCapabilities: [
        capabilityId("PERFORMANCE"),
        capabilityId("COMPARE"),
        capabilityId("DIAGNOSE"),
        capabilityId("EXPLAIN"),
        capabilityId("INVESTIGATE"),
        capabilityId("PRIORITIZE"),
    ],
};

// ─── Concept: Market ──────────────────────────────────────────────────────────
//
// A market is an aggregate competitive context — broader than a destination
// and more abstract than a specific supplier relationship. It represents the
// overall demand/supply landscape that shapes pricing and competitiveness.

export const MARKET_CONCEPT: BusinessConcept = {
    id:   conceptId("MARKET"),
    type: ConceptType.MARKET,
    name: "Market",

    description:
        "An aggregate competitive and commercial landscape in which hotel properties " +
        "and suppliers operate. A market encompasses the total addressable booking " +
        "volume, competitive intensity, pricing norms, and demand seasonality for a " +
        "given segment (e.g. luxury hotels in Southeast Asia, budget properties in Europe). " +
        "Market-level analysis provides the strategic context for performance assessment " +
        "and resource allocation decisions.",

    synonyms: [
        "market",
        "markets",
        "segment",
        "segments",
        "sector",
        "sectors",
        "industry",
        "competitive landscape",
        "market segment",
        "demand",
    ],

    applicableMetrics: [
        metricId("WIN_RATE"),
        metricId("REVENUE"),
        metricId("MARKET_SHARE"),
        metricId("VOLUME"),
        metricId("TREND"),
        metricId("CONFIDENCE"),
    ],

    supportedCapabilities: [
        capabilityId("PERFORMANCE"),
        capabilityId("COMPARE"),
        capabilityId("DIAGNOSE"),
        capabilityId("FORECAST"),
        capabilityId("INVESTIGATE"),
    ],
};

// ─── Concept: Dataset ─────────────────────────────────────────────────────────
//
// A dataset is a named analytical data source. It is a meta-entity — it
// represents the data itself, not a business object the data describes.
// Dataset analysis is primarily about data quality and availability.

export const DATASET_CONCEPT: BusinessConcept = {
    id:   conceptId("DATASET"),
    type: ConceptType.DATASET,
    name: "Dataset",

    description:
        "A named analytical data source containing business performance records. " +
        "In this platform, datasets correspond to specific CSV files or data exports " +
        "from the competitiveness, conversion, or revenue reporting systems. " +
        "Dataset-level analysis is primarily diagnostic — assessing data coverage, " +
        "observation counts, temporal completeness, and statistical confidence before " +
        "drawing business conclusions.",

    synonyms: [
        "dataset",
        "datasets",
        "data",
        "data source",
        "data file",
        "report",
        "reports",
        "export",
        "data export",
    ],

    // Datasets are measured by VOLUME (how many records) and CONFIDENCE (data quality).
    // You cannot measure a dataset's win rate or revenue — those belong to business entities.
    applicableMetrics: [
        metricId("VOLUME"),
        metricId("CONFIDENCE"),
    ],

    // Datasets only support INVESTIGATE (data quality / coverage analysis).
    // You do not COMPARE, FORECAST, RECOMMEND, or PRIORITIZE a data source.
    supportedCapabilities: [
        capabilityId("INVESTIGATE"),
    ],
};

// ─── Aggregated Export ────────────────────────────────────────────────────────
//
// A single array of all concepts, used by bootstrap.ts to register them in one loop.
// The order here does not affect behavior — the registry uses Maps, not arrays.

export const ALL_CONCEPTS: BusinessConcept[] = [
    HOTEL_CONCEPT,
    CHAIN_CONCEPT,
    DESTINATION_CONCEPT,
    SUPPLIER_CONCEPT,
    MARKET_CONCEPT,
    DATASET_CONCEPT,
];
