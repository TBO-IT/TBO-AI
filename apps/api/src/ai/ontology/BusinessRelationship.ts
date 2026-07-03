// ─────────────────────────────────────────────────────────────────────────────
// BusinessRelationship.ts
//
// WHY THIS FILE EXISTS:
//   A BusinessRelationship represents a directed, typed semantic edge between
//   two business concepts in the ontology graph. It answers: "How do the
//   things in this business relate to one another?"
//
//   Without relationships, the ontology is a flat bag of isolated concepts.
//   Relationships give it graph structure — enabling the Business Reasoner to
//   traverse "Hotel → Chain → Destination" chains, or identify that a Supplier
//   COMPETES_WITH another Supplier in a given Destination context.
//
// RESPONSIBILITY:
//   Define `RelationshipCardinality` and `BusinessRelationship` as pure type
//   contracts. No logic, no traversal, no graph queries. Those live in the registry.
//
// DESIGN DECISIONS:
//   1. `source` and `target` are branded `ConceptId` types.
//      The original stub used plain `string`. This was a category-safety gap:
//      nothing prevented passing a MetricId or CapabilityId as source/target.
//      With branded IDs, the TypeScript compiler enforces concept-to-concept edges.
//
//   2. `cardinality: RelationshipCardinality` encodes structural semantics.
//      The Business Reasoner needs this to traverse the graph correctly.
//      "Hotel BELONGS_TO Chain" is MANY_TO_ONE — aggregating hotels into their
//      chain requires a group-by on the chain dimension.
//      "Chain OPERATES_IN Destination" is MANY_TO_MANY — no simple aggregation.
//      Without cardinality, the Reasoner must guess or hardcode this logic.
//
//   3. `isBidirectional: boolean` captures symmetric relationships.
//      COMPETES_WITH is symmetric: if Supplier A competes with Supplier B,
//      then B competes with A. BELONGS_TO is NOT symmetric.
//      The registry uses this when building the "related concepts" traversal:
//      for bidirectional edges, `getRelationshipsTo(B)` also returns A→B edges.
//
//   4. `id` follows the convention "{SOURCE}__{TYPE}__{TARGET}".
//      This makes relationships self-describing in logs and diagnostics,
//      and makes deduplication during bootstrap straightforward.
//
//   5. `label` is the human-readable verb phrase.
//      Used in business narratives: "Hotel X [belongs to] Chain Y".
//      Keeping it on the relationship (not computed from RelationshipType)
//      allows domain-specific phrasing (e.g. "is part of" vs "belongs to")
//      for relationships of the same type in different contexts.
//
// FUTURE EXTENSIBILITY:
//   - Add `strength: "STRONG" | "WEAK" | "INFERRED"` to distinguish
//     hard structural relationships from soft contextual ones.
//   - Add `validFrom?: string` / `validUntil?: string` for temporally
//     bounded relationships in dynamic ontologies.
//   - Add `conditions?: string[]` for conditional relationships
//     (e.g. "Supplier COMPETES_WITH Supplier only in shared Destinations").
// ─────────────────────────────────────────────────────────────────────────────

import { ConceptId, RelationshipType } from "./types.js";

// ─── RelationshipCardinality ─────────────────────────────────────────────────

/**
 * Describes the structural multiplicity between concept instances connected
 * by this relationship.
 *
 * The Business Reasoner uses cardinality to:
 *   - Determine correct aggregation strategy when traversing the graph.
 *   - Avoid incorrect 1:1 assumptions when a relationship is actually 1:N.
 *   - Guide the Evidence Planner in selecting appropriate GROUP BY dimensions.
 *
 * ONE_TO_ONE   → Each source has exactly one target (rare in business domains).
 * ONE_TO_MANY  → One source maps to many targets (Chain → many Hotels).
 * MANY_TO_ONE  → Many sources map to one target (many Hotels → one Chain).
 * MANY_TO_MANY → Many sources to many targets (Chains ↔ Destinations).
 */
export type RelationshipCardinality =
    | "ONE_TO_ONE"
    | "ONE_TO_MANY"
    | "MANY_TO_ONE"
    | "MANY_TO_MANY";

// ─── BusinessRelationship ────────────────────────────────────────────────────

/**
 * Represents a directional, typed semantic edge between two business concepts.
 *
 * Relationships are the graph structure of the ontology. Concepts are nodes;
 * relationships are labeled, directed edges. Together they form a traversable
 * domain knowledge graph.
 *
 * Read as: "source [type/label] target"
 * Example: HOTEL [BELONGS_TO / "belongs to"] CHAIN
 *
 * @example
 * const hotelBelongsToChain: BusinessRelationship = {
 *   id: "HOTEL__BELONGS_TO__CHAIN",
 *   source: conceptId("HOTEL"),
 *   target: conceptId("CHAIN"),
 *   type: RelationshipType.BELONGS_TO,
 *   label: "belongs to",
 *   description: "A hotel operates under the brand, standards, and management ...",
 *   cardinality: "MANY_TO_ONE",
 *   isBidirectional: false,
 * };
 */
export interface BusinessRelationship {
    /**
     * Unique identifier for this relationship within the registry.
     *
     * Convention: "{SOURCE_ID}__{RELATIONSHIP_TYPE}__{TARGET_ID}"
     * Example: "HOTEL__BELONGS_TO__CHAIN", "SUPPLIER__COMPETES_WITH__SUPPLIER"
     *
     * This convention makes relationships self-describing in logs and diagnostics,
     * and enables simple deduplication checks during bootstrap.
     */
    readonly id: string;

    /**
     * The concept that originates (or "holds") this relationship.
     * Branded `ConceptId` — compiler rejects MetricId or CapabilityId here.
     */
    readonly source: ConceptId;

    /**
     * The concept that receives (or "is the target of") this relationship.
     * Branded `ConceptId` — compiler rejects MetricId or CapabilityId here.
     */
    readonly target: ConceptId;

    /**
     * The semantic verb category describing this relationship.
     * Determines the ontological meaning of the edge, independent of phrasing.
     */
    readonly type: RelationshipType;

    /**
     * Human-readable verb phrase for use in business narratives.
     * Used by the Consulting Engine when constructing explanations:
     * "Hotel X [belongs to] Chain Y, which [operates in] Destination Z."
     */
    readonly label: string;

    /**
     * Business-language description of the semantic meaning and operational
     * implications of this relationship.
     *
     * Should explain:
     *   - What the relationship means in the business domain.
     *   - What implications it has for analysis and reasoning.
     *   - Why this relationship matters to executives.
     *
     * Must NOT reference SQL, schemas, or any infrastructure.
     */
    readonly description: string;

    /**
     * The structural multiplicity between concept instances in this relationship.
     * Used by the Business Reasoner to determine correct aggregation strategy
     * when traversing the ontology graph.
     */
    readonly cardinality: RelationshipCardinality;

    /**
     * Whether this relationship is semantically symmetric.
     *
     * If true, "A [type] B" implies "B [type] A" with the same meaning.
     * COMPETES_WITH is bidirectional — if Supplier A competes with B, B competes with A.
     * BELONGS_TO is NOT bidirectional — Chain does not "belong to" Hotel.
     *
     * The registry uses this flag in `getRelatedConcepts()` to correctly
     * surface both directions of symmetric relationships without storing
     * redundant reverse-edge records.
     */
    readonly isBidirectional: boolean;
}