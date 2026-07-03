// ─────────────────────────────────────────────────────────────────────────────
// BusinessCapability.ts
//
// WHY THIS FILE EXISTS:
//   A BusinessCapability is the ontology's representation of an analytical
//   operation the system can perform. It answers the question: "What can we
//   *do* with this business knowledge?"
//
//   PERFORMANCE, COMPARE, DIAGNOSE, EXPLAIN, RECOMMEND, FORECAST, INVESTIGATE,
//   and PRIORITIZE are not just verb labels — they carry structured contracts:
//   which metrics are required, what evidence must be collected, and what
//   concepts they can be applied to.
//
// RESPONSIBILITY:
//   Define the `BusinessCapability` interface as a pure type contract.
//   No logic, no dispatch, no infrastructure.
//
// DESIGN DECISIONS:
//   1. `evidenceKinds: readonly EvidenceKind[]` replaces `requiredEvidence: string[]`.
//      This is the most consequential change from the original stub.
//      EvidenceKind is a compiler-checked enum. The future EvidencePlanner will
//      switch on these values to dispatch SQL collection strategies. If evidence
//      kinds were strings, any typo or case mismatch would create a silent no-op
//      at collection time — a failure that would be extremely hard to diagnose.
//
//   2. `requiredMetrics` uses branded `MetricId[]`.
//      The compiler enforces that these IDs are valid MetricIds, not concept IDs
//      or arbitrary strings. During bootstrap validation, the registry verifies
//      that each MetricId actually exists in the metric map.
//
//   3. `applicableConcepts` constrains which ConceptTypes this capability makes
//      sense for. FORECAST is valid for HOTEL, CHAIN, DESTINATION, MARKET —
//      but not for DATASET (you cannot forecast a data source).
//      This allows the Analysis Registry to quickly reject invalid combinations
//      before expensive Evidence Planner work begins.
//
//   4. `outputDescription` encodes what this capability *produces*.
//      The future Prompt Builder reads this to frame Claude's output expectation.
//      Rather than hardcoding "give me a comparison table" in prompt logic,
//      the Prompt Builder reads the capability's outputDescription and constructs
//      the framing dynamically.
//
//   5. `minimumEvidenceThreshold` provides a quality gate.
//      The Business Reasoner checks: "Do I have at least N evidence pieces of
//      the required kinds before proceeding?" If not, it reports insufficient data
//      rather than generating a low-confidence hallucination.
//
// FUTURE EXTENSIBILITY:
//   - Add `confidenceRequirements: number` for minimum statistical confidence
//     scores before this capability produces a firm conclusion.
//   - Add `composedOf: readonly CapabilityId[]` for compound capabilities
//     (e.g. DIAGNOSE might be composed of PERFORMANCE + COMPARE + EXPLAIN).
//   - Add `outputSchema: string` (JSON Schema reference) when the Consulting Engine
//     needs structured output validation beyond description-level contracts.
// ─────────────────────────────────────────────────────────────────────────────

import {
    CapabilityId,
    CapabilityType,
    MetricId,
    EvidenceKind,
    ConceptType,
} from "./types.js";

/**
 * Represents an analytical operation the system can perform on business concepts.
 *
 * A BusinessCapability is a named, typed reasoning contract — not a function,
 * not an API endpoint, not a prompt template. It defines *what* is needed to
 * perform a specific class of business analysis, not *how* to perform it.
 *
 * The "how" is delegated to:
 *   - EvidencePlanner (collects the evidence)
 *   - BusinessReasoner (synthesizes the conclusion)
 *   - ConsultingEngine (frames the narrative)
 *   - PromptBuilder (instructs Claude on output format)
 *
 * @example
 * const diagnose: BusinessCapability = {
 *   id: capabilityId("DIAGNOSE"),
 *   type: CapabilityType.DIAGNOSE,
 *   name: "Diagnose",
 *   description: "Identifies the root drivers behind a metric's current level ...",
 *   requiredMetrics: [metricId("WIN_RATE")],
 *   evidenceKinds: [EvidenceKind.TREND_SERIES, EvidenceKind.ENTITY_BREAKDOWN, EvidenceKind.CAUSAL_TRACE],
 *   applicableConcepts: [ConceptType.HOTEL, ConceptType.CHAIN, ConceptType.DESTINATION],
 *   outputDescription: "A ranked list of drivers with quantified contribution ...",
 *   minimumEvidenceThreshold: 2,
 * };
 */
export interface BusinessCapability {
    /**
     * Globally unique identifier within the OntologyRegistry.
     * Branded `CapabilityId` — compiler rejects passing a `ConceptId` or `MetricId` here.
     */
    readonly id: CapabilityId;

    /**
     * The capability's semantic category.
     */
    readonly type: CapabilityType;

    /**
     * Human-readable name.
     */
    readonly name: string;

    /**
     * Business-language description of what this capability does and when to apply it.
     *
     * Should answer:
     *   - What question does this capability answer?
     *   - When should it be triggered?
     *   - What does it produce?
     */
    readonly description: string;

    /**
     * MetricIds of metrics that must be present in the evidence set for this
     * capability to produce a valid output.
     *
     * If any required metric is unavailable in the collected evidence, the
     * Business Reasoner must flag insufficient data rather than proceeding.
     *
     * An empty array means the capability operates on structural or relational
     * evidence only (e.g. a pure INVESTIGATION into data quality).
     */
    readonly requiredMetrics: readonly MetricId[];

    /**
     * Typed evidence categories this capability needs.
     *
     * Each EvidenceKind value maps to a specific SQL collection strategy in
     * the EvidencePlanner. Using an enum here ensures the planner never
     * silently skips a required evidence type due to a string mismatch.
     *
     * The EvidencePlanner iterates these kinds and dispatches the corresponding
     * collection strategy for each, assembling the full evidence set before
     * passing it to the Business Reasoner.
     */
    readonly evidenceKinds: readonly EvidenceKind[];

    /**
     * The ConceptTypes this capability can be meaningfully applied to.
     *
     * The Analysis Registry uses this to reject invalid combinations before
     * the Evidence Planner is invoked. This avoids wasted work and confusing
     * error messages late in the pipeline.
     *
     * Example: FORECAST is not applicable to DATASET or SUPPLIER.
     * Example: INVESTIGATE is applicable to all ConceptTypes including DATASET.
     */
    readonly applicableConcepts: readonly ConceptType[];

    /**
     * Business-language description of what this capability produces.
     *
     * The future Prompt Builder reads this to frame Claude's output structure
     * and expectations. This eliminates the need to hardcode output framing
     * in prompt templates — it becomes a property of the capability definition.
     *
     * @example COMPARE → "A side-by-side metric comparison table with percentage
     *           deltas and a directional assessment for each metric."
     * @example PRIORITIZE → "A ranked list of entities by opportunity magnitude,
     *           with supporting evidence and an executive action recommendation."
     */
    readonly outputDescription: string;

    /**
     * Minimum number of distinct evidence pieces required before this capability
     * can produce a confident conclusion.
     *
     * The Business Reasoner checks this threshold before synthesizing output.
     * If evidence is below threshold, it produces a hedged or partial response
     * rather than a confident but unsupported conclusion.
     *
     * A value of 1 means a single evidence piece is sufficient (e.g. AGGREGATE_SUMMARY
     * for a simple PERFORMANCE query).
     */
    readonly minimumEvidenceThreshold: number;
}