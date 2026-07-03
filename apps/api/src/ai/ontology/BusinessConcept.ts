// ─────────────────────────────────────────────────────────────────────────────
// BusinessConcept.ts
//
// WHY THIS FILE EXISTS:
//   A BusinessConcept is the ontology's representation of a named business entity.
//   It answers the question: "What things does this business reason about?"
//   Hotels, chains, destinations, suppliers, markets — these are the nouns
//   of the business language. This file defines the shape of each noun.
//
// RESPONSIBILITY:
//   Define the `BusinessConcept` interface only. No logic, no instantiation,
//   no registry interaction. This file is a pure type contract.
//
// DESIGN DECISIONS:
//   1. Relationships are NOT stored on the concept.
//      The original stub had `relationships: string[]`. This was removed because:
//        - It couples a concept definition to other concept definitions.
//        - It creates a direction problem (who owns the edge?).
//        - It prevents the registry from being the single source of graph truth.
//      Relationships live exclusively in BusinessRelationship and are managed
//      as a graph by OntologyRegistry.
//
//   2. `id` is a branded `ConceptId`, not a raw `string`.
//      TypeScript will reject passing a `MetricId` or `CapabilityId` where a
//      `ConceptId` is expected. This eliminates a whole class of ID mix-up bugs.
//
//   3. All array properties are `readonly`.
//      Concepts are value objects. They are defined once (in data/concepts.ts),
//      registered once (in bootstrap.ts), and never mutated. `readonly` makes
//      this intent structurally enforced.
//
//   4. `synonyms` carries business value beyond linguistic convenience.
//      The Entity Resolver currently loops through metadata values. With the
//      ontology, the future Entity Resolver can ask: "Does this token match any
//      concept synonym?" — separating ontology-level entity recognition from
//      dataset-level value matching.
//
//   5. `applicableMetrics` and `supportedCapabilities` use branded ID types.
//      This means the bootstrap process verifies, at compile time, that these
//      arrays reference valid, typed IDs — preventing the data files from
//      accidentally cross-referencing a wrong category.
//
// FUTURE EXTENSIBILITY:
//   - Add `industryTags: readonly string[]` when multi-industry support arrives,
//     allowing the registry to filter concepts by industry domain.
//   - Add `parentConceptId?: ConceptId` for hierarchical concept taxonomies
//     (e.g. LUXURY_HOTEL extends HOTEL) without changing the relationship graph.
// ─────────────────────────────────────────────────────────────────────────────

import { ConceptId, ConceptType, MetricId, CapabilityId } from "./types.js";

/**
 * Represents a fundamental business entity in the ontology.
 *
 * A concept is the domain-level answer to "what things does this business reason about?"
 * It is a pure value object: no methods, no mutable state, no infrastructure concerns.
 *
 * @example
 * const hotel: BusinessConcept = {
 *   id: conceptId("HOTEL"),
 *   type: ConceptType.HOTEL,
 *   name: "Hotel",
 *   description: "A bookable accommodation property ...",
 *   synonyms: ["property", "accommodation", "lodging"],
 *   applicableMetrics: [metricId("WIN_RATE"), metricId("REVENUE")],
 *   supportedCapabilities: [capabilityId("PERFORMANCE"), capabilityId("COMPARE")],
 * };
 */
export interface BusinessConcept {
    /**
     * Globally unique identifier within the OntologyRegistry.
     *
     * Uses branded `ConceptId` type — TypeScript will reject attempts to pass
     * a `MetricId` or `CapabilityId` in its place. This is the primary guard
     * against ID category errors across a large multi-industry registry.
     *
     * Naming convention: SCREAMING_SNAKE_CASE matching the ConceptType
     * where the concept is a singleton (e.g. "HOTEL", "CHAIN").
     * For multiple concepts of the same type, use a qualified name
     * (e.g. "LUXURY_HOTEL", "BUDGET_HOTEL").
     */
    readonly id: ConceptId;

    /**
     * The semantic category this concept belongs to.
     *
     * Multiple distinct concepts may share the same ConceptType. For example,
     * "LUXURY_HOTEL" and "BUDGET_HOTEL" both have type `ConceptType.HOTEL`.
     * ConceptType defines the category; `id` identifies the specific member.
     */
    readonly type: ConceptType;

    /**
     * Human-readable display name for this concept.
     *
     * Used in executive reports, error messages, and diagnostic output.
     * Should be in Title Case, singular form.
     */
    readonly name: string;

    /**
     * Business-language definition of what this concept represents.
     *
     * Written from an executive perspective, not a technical one.
     * Must NOT reference SQL, database schemas, column names, API endpoints,
     * or any infrastructure concern. The ontology is infrastructure-agnostic.
     */
    readonly description: string;

    /**
     * Natural language aliases executives and users use for this concept.
     *
     * Consumed by `OntologyRegistry.findConceptBySynonym()` to support
     * intent-to-concept resolution without hardcoded string comparisons.
     *
     * Examples for HOTEL: ["property", "accommodation", "lodging", "resort"]
     * Examples for SUPPLIER: ["OTA", "channel", "competitor", "provider"]
     *
     * All entries should be lowercase. The registry normalizes lookups.
     */
    readonly synonyms: readonly string[];

    /**
     * Metric IDs that meaningfully measure or describe this concept.
     *
     * Consumed by `OntologyRegistry.getMetricsForConcept()`. Guides the
     * Evidence Planner in selecting which metrics to collect when a question
     * references this concept.
     *
     * All IDs must exist in the OntologyRegistry — validated at bootstrap time.
     */
    readonly applicableMetrics: readonly MetricId[];

    /**
     * Capability IDs representing analytical operations valid for this concept.
     *
     * Consumed by `OntologyRegistry.getCapabilitiesForConcept()`. Guides the
     * Analysis Registry in determining which reasoning modes are available.
     *
     * Example: DATASET only supports INVESTIGATE (data quality analysis),
     * not FORECAST or RECOMMEND (you cannot forecast a data source).
     *
     * All IDs must exist in the OntologyRegistry — validated at bootstrap time.
     */
    readonly supportedCapabilities: readonly CapabilityId[];
}