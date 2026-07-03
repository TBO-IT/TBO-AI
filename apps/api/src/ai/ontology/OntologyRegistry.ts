// ─────────────────────────────────────────────────────────────────────────────
// OntologyRegistry.ts
//
// WHY THIS FILE EXISTS:
//   The OntologyRegistry is the single source of truth for all business knowledge
//   in the system. It is the hub through which every future intelligence layer
//   component accesses domain knowledge:
//
//     EntityResolver  → findConceptBySynonym, findMetricBySynonym
//     AnalysisRegistry → getCapabilitiesForConcept, getCapabilityByType
//     EvidencePlanner  → getCapabilitiesForMetric, evidenceKinds traversal
//     BusinessReasoner → getMetricsForConcept, getRelatedConcepts
//     PromptBuilder    → getConcept, getCapabilityByType, outputDescription
//
//   No component should hardcode business knowledge. All knowledge is queried
//   through this registry.
//
// RESPONSIBILITY:
//   - Accept registration of BusinessConcept, BusinessMetric, BusinessCapability,
//     and BusinessRelationship during the bootstrap phase.
//   - Seal itself after bootstrap to prevent runtime mutation.
//   - Provide a rich domain query API for all downstream consumers.
//   - Build synonym indexes at seal time for O(1) synonym lookups.
//   - Validate cross-references during registration to surface data errors early.
//
// DESIGN DECISIONS:
//   1. Open-during-bootstrap, sealed-after: The `seal()` method applies the
//      open/closed principle at the instance level. During bootstrap (open):
//      registration is allowed. After seal() (closed): all mutation throws.
//      This prevents accidental runtime ontology modification, which would
//      create hard-to-diagnose inconsistencies across concurrent requests.
//
//   2. Synonym indexes built at seal time, not at registration time.
//      Building indexes incrementally during registration adds complexity
//      and can produce inconsistent indexes if registration order changes.
//      Sealing triggers a one-time O(n) index build. Lookups are then O(1).
//
//   3. All query methods return arrays (never undefined) for collections.
//      Returning `undefined` from getMetricsForConcept() forces callers to null-
//      check before iterating. An empty array is always safe to iterate.
//      The pattern: `get*(id)` → concept|undefined, `getAll*()` → array.
//
//   4. Cross-reference validation is performed at registration time, not seal time.
//      If a concept references a MetricId that was never registered, we want to
//      know immediately, not after the entire ontology is loaded. However,
//      because registration order is not guaranteed, cross-reference validation
//      is deferred to a final `validate()` call inside `seal()`.
//
//   5. Private maps use ReadonlyMap type at the class level, but are populated
//      via standard Maps internally. This ensures callers accessing internal
//      state through any exposure path cannot mutate the maps.
//
//   6. The registry does NOT extend Map or any built-in. Composition over
//      inheritance — the registry is a domain object, not a data structure.
//
// FUTURE EXTENSIBILITY:
//   - Add `getOntologyForIndustry(industry: string): OntologyRegistry` to support
//     multi-industry deployments where different registries coexist.
//   - Add `merge(other: OntologyRegistry): OntologyRegistry` for combining
//     base ontologies with domain-specific extensions.
//   - Add `findRelationshipPath(from: ConceptId, to: ConceptId): BusinessRelationship[]`
//     for multi-hop graph traversal (BFS/DFS through the concept graph).
//   - Add LRU cache for hot query paths when the registry grows to 1000+ entries.
// ─────────────────────────────────────────────────────────────────────────────

import { BusinessConcept } from "./BusinessConcept.js";
import { BusinessMetric } from "./BusinessMetric.js";
import { BusinessCapability } from "./BusinessCapability.js";
import { BusinessRelationship } from "./BusinessRelationship.js";
import {
    ConceptId,
    MetricId,
    CapabilityId,
    ConceptType,
    MetricType,
    CapabilityType,
    RelationshipType,
    OntologySummary,
} from "./types.js";

// ─── Internal Synonym Index ───────────────────────────────────────────────────

/**
 * A flat synonym-to-ID lookup map built once at seal time.
 * Keys are lowercased synonym strings. Values are the canonical ID.
 * Built from all `synonyms` arrays across registered entities.
 */
type SynonymIndex<TId extends string> = Map<string, TId>;

// ─── Registry Errors ─────────────────────────────────────────────────────────

/**
 * Thrown when attempting to mutate a sealed OntologyRegistry.
 */
export class OntologyRegistryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "OntologyRegistryError";
    }
}

// ─── OntologyRegistry ────────────────────────────────────────────────────────

/**
 * The single source of truth for all business knowledge in the intelligence layer.
 *
 * Lifecycle:
 *   1. Instantiate: `new OntologyRegistry()`
 *   2. Register: call `registerConcept()`, `registerMetric()`, etc.
 *   3. Seal: call `seal()` — builds synonym indexes, validates cross-references.
 *   4. Query: use any `get*`, `find*`, `getAll*` method.
 *
 * After `seal()` is called, all registration methods throw `OntologyRegistryError`.
 * Query methods are always safe to call (before or after sealing).
 *
 * @example
 * const registry = new OntologyRegistry();
 * registry.registerConcept(hotelConcept);
 * registry.registerMetric(winRateMetric);
 * registry.seal();
 * const hotel = registry.getConcept(conceptId("HOTEL"));
 */
export class OntologyRegistry {

    // ── Internal storage ───────────────────────────────────────────────────────

    private readonly _concepts      = new Map<ConceptId, BusinessConcept>();
    private readonly _metrics       = new Map<MetricId, BusinessMetric>();
    private readonly _capabilities  = new Map<CapabilityId, BusinessCapability>();
    private readonly _relationships: BusinessRelationship[] = [];

    // ── Synonym indexes (built at seal time) ───────────────────────────────────
    // Populated once during seal(). Empty before sealing.

    private _conceptSynonymIndex: SynonymIndex<ConceptId>   = new Map();
    private _metricSynonymIndex:  SynonymIndex<MetricId>    = new Map();

    // ── State ──────────────────────────────────────────────────────────────────

    private _sealed = false;

    // ─── Registration API ──────────────────────────────────────────────────────
    //
    // All registration methods check `_sealed` first.
    // Registration is a bootstrap-only operation. At runtime, the registry
    // is read-only. This is the open/closed principle applied at instance level.

    /**
     * Registers a business concept in the registry.
     * Throws if the registry is already sealed or if the ID is a duplicate.
     */
    registerConcept(concept: BusinessConcept): void {
        this.assertNotSealed("registerConcept");
        if (this._concepts.has(concept.id)) {
            throw new OntologyRegistryError(
                `Duplicate concept ID: "${concept.id}". Each concept must have a unique ID.`
            );
        }
        this._concepts.set(concept.id, concept);
    }

    /**
     * Registers a business metric in the registry.
     * Throws if the registry is already sealed or if the ID is a duplicate.
     */
    registerMetric(metric: BusinessMetric): void {
        this.assertNotSealed("registerMetric");
        if (this._metrics.has(metric.id)) {
            throw new OntologyRegistryError(
                `Duplicate metric ID: "${metric.id}". Each metric must have a unique ID.`
            );
        }
        this._metrics.set(metric.id, metric);
    }

    /**
     * Registers a business capability in the registry.
     * Throws if the registry is already sealed or if the ID is a duplicate.
     */
    registerCapability(capability: BusinessCapability): void {
        this.assertNotSealed("registerCapability");
        if (this._capabilities.has(capability.id)) {
            throw new OntologyRegistryError(
                `Duplicate capability ID: "${capability.id}". Each capability must have a unique ID.`
            );
        }
        this._capabilities.set(capability.id, capability);
    }

    /**
     * Registers a business relationship in the registry.
     * Throws if the registry is already sealed or if the ID is a duplicate.
     */
    registerRelationship(relationship: BusinessRelationship): void {
        this.assertNotSealed("registerRelationship");
        const duplicate = this._relationships.find(r => r.id === relationship.id);
        if (duplicate) {
            throw new OntologyRegistryError(
                `Duplicate relationship ID: "${relationship.id}".`
            );
        }
        this._relationships.push(relationship);
    }

    // ─── Seal ──────────────────────────────────────────────────────────────────

    /**
     * Seals the registry, making it immutable.
     *
     * Sealing triggers three operations in sequence:
     *   1. Builds synonym indexes for O(1) synonym lookups.
     *   2. Validates all cross-references (concept→metric, concept→capability).
     *   3. Sets the sealed flag — all future registration attempts throw.
     *
     * Call this once after all bootstrap registrations are complete.
     * Calling seal() more than once is a no-op (idempotent).
     */
    seal(): void {
        if (this._sealed) return;
        this.buildSynonymIndexes();
        this.validateCrossReferences();
        this._sealed = true;
    }

    /** Whether the registry has been sealed and is now read-only. */
    get isSealed(): boolean {
        return this._sealed;
    }

    // ─── Direct Lookup API ────────────────────────────────────────────────────
    // O(1) map lookups by ID. Returns undefined if not found (not throws).

    /**
     * Retrieves a concept by its branded ConceptId.
     * Returns `undefined` if no concept with the given ID exists.
     */
    getConcept(id: ConceptId): BusinessConcept | undefined {
        return this._concepts.get(id);
    }

    /**
     * Retrieves a metric by its branded MetricId.
     * Returns `undefined` if no metric with the given ID exists.
     */
    getMetric(id: MetricId): BusinessMetric | undefined {
        return this._metrics.get(id);
    }

    /**
     * Retrieves a capability by its branded CapabilityId.
     * Returns `undefined` if no capability with the given ID exists.
     */
    getCapability(id: CapabilityId): BusinessCapability | undefined {
        return this._capabilities.get(id);
    }

    // ─── Collection API ───────────────────────────────────────────────────────
    // Returns all registered entries as immutable readonly arrays.

    /** Returns all registered concepts as a readonly array. */
    getAllConcepts(): ReadonlyArray<BusinessConcept> {
        return Array.from(this._concepts.values());
    }

    /** Returns all registered metrics as a readonly array. */
    getAllMetrics(): ReadonlyArray<BusinessMetric> {
        return Array.from(this._metrics.values());
    }

    /** Returns all registered capabilities as a readonly array. */
    getAllCapabilities(): ReadonlyArray<BusinessCapability> {
        return Array.from(this._capabilities.values());
    }

    /** Returns all registered relationships as a readonly array. */
    getAllRelationships(): ReadonlyArray<BusinessRelationship> {
        return [...this._relationships];
    }

    // ─── Type-Based Query API ─────────────────────────────────────────────────

    /**
     * Returns all concepts of a specific ConceptType.
     *
     * @example
     * registry.getConceptsByType(ConceptType.HOTEL)
     * // → [hotelConcept] (or multiple if luxury/budget hotel concepts are registered)
     */
    getConceptsByType(type: ConceptType): BusinessConcept[] {
        return Array.from(this._concepts.values())
            .filter(c => c.type === type);
    }

    /**
     * Returns all metrics of a specific MetricType.
     *
     * Useful when multiple concrete metrics share the same semantic category.
     */
    getMetricsByType(type: MetricType): BusinessMetric[] {
        return Array.from(this._metrics.values())
            .filter(m => m.type === type);
    }

    /**
     * Returns the first capability matching a specific CapabilityType.
     *
     * In the standard hospitality ontology there is exactly one capability
     * per CapabilityType. Returns `undefined` if none is registered.
     */
    getCapabilityByType(type: CapabilityType): BusinessCapability | undefined {
        return Array.from(this._capabilities.values())
            .find(c => c.type === type);
    }

    // ─── Concept-Centric Query API ────────────────────────────────────────────

    /**
     * Returns all metrics applicable to a specific concept.
     *
     * Reads from `BusinessConcept.applicableMetrics` and resolves each MetricId
     * to the full `BusinessMetric` object. IDs that resolve to undefined are
     * silently skipped (protected by seal-time cross-reference validation).
     *
     * @example
     * registry.getMetricsForConcept(conceptId("HOTEL"))
     * // → [winRateMetric, priceGapMetric, revenueMetric, ...]
     */
    getMetricsForConcept(conceptId: ConceptId): BusinessMetric[] {
        const concept = this._concepts.get(conceptId);
        if (!concept) return [];
        return concept.applicableMetrics
            .map(id => this._metrics.get(id))
            .filter((m): m is BusinessMetric => m !== undefined);
    }

    /**
     * Returns all capabilities supported by a specific concept.
     *
     * Reads from `BusinessConcept.supportedCapabilities` and resolves each
     * CapabilityId to the full `BusinessCapability` object.
     *
     * @example
     * registry.getCapabilitiesForConcept(conceptId("DATASET"))
     * // → [investigateCapability] — DATASET only supports INVESTIGATE
     */
    getCapabilitiesForConcept(conceptId: ConceptId): BusinessCapability[] {
        const concept = this._concepts.get(conceptId);
        if (!concept) return [];
        return concept.supportedCapabilities
            .map(id => this._capabilities.get(id))
            .filter((c): c is BusinessCapability => c !== undefined);
    }

    // ─── Metric-Centric Query API ─────────────────────────────────────────────

    /**
     * Returns all capabilities that support a specific metric.
     *
     * Traverses all registered capabilities and returns those whose
     * `requiredMetrics` includes the given MetricId.
     *
     * Used by the Evidence Planner to ask: "This metric is available —
     * which capabilities can now be unlocked?"
     *
     * @example
     * registry.getCapabilitiesForMetric(metricId("WIN_RATE"))
     * // → [performanceCapability, compareCapability, diagnoseCapability, ...]
     */
    getCapabilitiesForMetric(metricId: MetricId): BusinessCapability[] {
        return Array.from(this._capabilities.values())
            .filter(c => c.requiredMetrics.includes(metricId));
    }

    /**
     * Returns all concepts that this metric is applicable to.
     *
     * Traverses all registered concepts and returns those whose
     * `applicableMetrics` includes the given MetricId.
     *
     * Complementary to `BusinessMetric.applicableTo` (concept types) —
     * this returns full concept objects for the registered matching IDs.
     */
    getConceptsForMetric(metricId: MetricId): BusinessConcept[] {
        return Array.from(this._concepts.values())
            .filter(c => c.applicableMetrics.includes(metricId));
    }

    // ─── Relationship / Graph Query API ───────────────────────────────────────

    /**
     * Returns all relationships originating FROM a concept (outgoing edges).
     *
     * Optionally filtered by RelationshipType.
     *
     * @example
     * registry.getRelationshipsFrom(conceptId("HOTEL"))
     * // → [HOTEL→CHAIN (BELONGS_TO), HOTEL→DESTINATION (OPERATES_IN), ...]
     */
    getRelationshipsFrom(
        conceptId: ConceptId,
        type?: RelationshipType
    ): BusinessRelationship[] {
        return this._relationships.filter(r => {
            const sourceMatch = r.source === conceptId;
            const typeMatch   = type === undefined || r.type === type;
            return sourceMatch && typeMatch;
        });
    }

    /**
     * Returns all relationships arriving AT a concept (incoming edges).
     *
     * For bidirectional relationships, also returns relationships where
     * this concept is the source (since A→B implies B←A semantically).
     *
     * Optionally filtered by RelationshipType.
     *
     * @example
     * registry.getRelationshipsTo(conceptId("CHAIN"))
     * // → [HOTEL→CHAIN (BELONGS_TO), HOTEL→CHAIN (OWNED_BY)]
     */
    getRelationshipsTo(
        conceptId: ConceptId,
        type?: RelationshipType
    ): BusinessRelationship[] {
        return this._relationships.filter(r => {
            const targetMatch = r.target === conceptId;
            // For bidirectional relationships, also include reverse-direction edges
            const biDirectionalMatch = r.isBidirectional && r.source === conceptId;
            const typeMatch = type === undefined || r.type === type;
            return (targetMatch || biDirectionalMatch) && typeMatch;
        });
    }

    /**
     * Returns all relationships between two specific concepts (in either direction).
     *
     * Finds relationships where (source=A, target=B) OR (source=B, target=A).
     * Useful when the caller does not know relationship direction a priori.
     */
    getRelationshipsBetween(
        sourceId: ConceptId,
        targetId: ConceptId
    ): BusinessRelationship[] {
        return this._relationships.filter(r =>
            (r.source === sourceId && r.target === targetId) ||
            (r.source === targetId && r.target === sourceId)
        );
    }

    /**
     * Returns all concepts directly related to a concept (one hop).
     *
     * Traverses both outgoing and incoming edges. For bidirectional relationships,
     * ensures the related concept appears only once.
     *
     * Optionally filtered by RelationshipType.
     *
     * @example
     * registry.getRelatedConcepts(conceptId("HOTEL"))
     * // → [chainConcept, destinationConcept, supplierConcept]
     */
    getRelatedConcepts(
        conceptId: ConceptId,
        type?: RelationshipType
    ): BusinessConcept[] {
        const relatedIds = new Set<ConceptId>();

        // Outgoing edges: collect targets
        this.getRelationshipsFrom(conceptId, type).forEach(r => {
            relatedIds.add(r.target);
        });

        // Incoming edges: collect sources
        this._relationships
            .filter(r => r.target === conceptId && (type === undefined || r.type === type))
            .forEach(r => relatedIds.add(r.source));

        // Exclude the concept itself (self-referential relationships like COMPETES_WITH)
        relatedIds.delete(conceptId);

        return Array.from(relatedIds)
            .map(id => this._concepts.get(id))
            .filter((c): c is BusinessConcept => c !== undefined);
    }

    // ─── Synonym Lookup API ───────────────────────────────────────────────────
    //
    // These methods enable the Entity Resolver and Analysis Registry to map
    // natural language phrases to ontology IDs without hardcoded string tables.
    //
    // Synonym indexes are built at seal() time. Calling these methods before
    // sealing will work but may return incomplete results if not all entries
    // are registered yet — always query after sealing.

    /**
     * Finds a concept whose synonym array includes the given phrase.
     *
     * Lookup is case-insensitive and trims whitespace.
     * Returns the first matching concept, or `undefined` if none matches.
     *
     * @example
     * registry.findConceptBySynonym("accommodation")
     * // → hotelConcept (because "accommodation" is in HOTEL.synonyms)
     *
     * registry.findConceptBySynonym("OTA")
     * // → supplierConcept (because "ota" is in SUPPLIER.synonyms)
     */
    findConceptBySynonym(synonym: string): BusinessConcept | undefined {
        const normalized = synonym.toLowerCase().trim();
        const id = this._conceptSynonymIndex.get(normalized);
        return id !== undefined ? this._concepts.get(id) : undefined;
    }

    /**
     * Finds a metric whose synonym array includes the given phrase.
     *
     * Lookup is case-insensitive and trims whitespace.
     * Returns the first matching metric, or `undefined` if none matches.
     *
     * @example
     * registry.findMetricBySynonym("winning percentage")
     * // → winRateMetric
     *
     * registry.findMetricBySynonym("competitive performance")
     * // → winRateMetric
     */
    findMetricBySynonym(synonym: string): BusinessMetric | undefined {
        const normalized = synonym.toLowerCase().trim();
        const id = this._metricSynonymIndex.get(normalized);
        return id !== undefined ? this._metrics.get(id) : undefined;
    }

    // ─── Diagnostics API ─────────────────────────────────────────────────────

    /**
     * Returns a read-only summary of the registry's current contents.
     *
     * Used for health checks, startup diagnostics, and admin introspection.
     * Does NOT expose internal maps or mutable state.
     */
    getSummary(): OntologySummary {
        const concepts     = Array.from(this._concepts.values());
        const metrics      = Array.from(this._metrics.values());
        const capabilities = Array.from(this._capabilities.values());

        return {
            conceptCount:      this._concepts.size,
            metricCount:       this._metrics.size,
            capabilityCount:   this._capabilities.size,
            relationshipCount: this._relationships.length,
            isSealed:          this._sealed,
            conceptTypes:    [...new Set(concepts.map(c => c.type))],
            metricTypes:     [...new Set(metrics.map(m => m.type))],
            capabilityTypes: [...new Set(capabilities.map(c => c.type))],
        };
    }

    // ─── Private Internals ────────────────────────────────────────────────────

    /**
     * Throws if the registry is sealed. Called at the start of all registration methods.
     */
    private assertNotSealed(operation: string): void {
        if (this._sealed) {
            throw new OntologyRegistryError(
                `Cannot call "${operation}" after OntologyRegistry.seal() has been called. ` +
                `The registry is immutable after sealing. All registrations must occur during bootstrap.`
            );
        }
    }

    /**
     * Builds flat synonym-to-ID lookup maps for O(1) synonym resolution.
     *
     * Called once during seal(). For each registered concept and metric,
     * iterates the `synonyms` array and maps each lowercased synonym
     * to the entity's ID.
     *
     * If two entities share a synonym, the last one registered wins.
     * This is intentional — during bootstrap, data files are responsible
     * for ensuring synonym uniqueness. A warning is not emitted here to
     * keep the registry infrastructure-agnostic (no logger dependency).
     */
    private buildSynonymIndexes(): void {
        this._conceptSynonymIndex = new Map();
        this._metricSynonymIndex  = new Map();

        for (const concept of this._concepts.values()) {
            for (const synonym of concept.synonyms) {
                this._conceptSynonymIndex.set(synonym.toLowerCase().trim(), concept.id);
            }
        }

        for (const metric of this._metrics.values()) {
            for (const synonym of metric.synonyms) {
                this._metricSynonymIndex.set(synonym.toLowerCase().trim(), metric.id);
            }
        }
    }

    /**
     * Validates all cross-references after all data has been registered.
     *
     * Checks:
     *   1. Every MetricId in a concept's `applicableMetrics` resolves to a registered metric.
     *   2. Every CapabilityId in a concept's `supportedCapabilities` resolves to a registered capability.
     *   3. Every MetricId in a capability's `requiredMetrics` resolves to a registered metric.
     *   4. Every ConceptId in a relationship's `source`/`target` resolves to a registered concept.
     *
     * Throws `OntologyRegistryError` listing all violations if any are found.
     * This eager validation surfaces data errors at startup rather than
     * silently producing undefined values during runtime queries.
     */
    private validateCrossReferences(): void {
        const violations: string[] = [];

        // Validate concept metric and capability references
        for (const concept of this._concepts.values()) {
            for (const metricId of concept.applicableMetrics) {
                if (!this._metrics.has(metricId)) {
                    violations.push(
                        `Concept "${concept.id}" references unknown MetricId "${metricId}"`
                    );
                }
            }
            for (const capabilityId of concept.supportedCapabilities) {
                if (!this._capabilities.has(capabilityId)) {
                    violations.push(
                        `Concept "${concept.id}" references unknown CapabilityId "${capabilityId}"`
                    );
                }
            }
        }

        // Validate capability metric references
        for (const capability of this._capabilities.values()) {
            for (const metricId of capability.requiredMetrics) {
                if (!this._metrics.has(metricId)) {
                    violations.push(
                        `Capability "${capability.id}" references unknown MetricId "${metricId}"`
                    );
                }
            }
        }

        // Validate relationship concept references
        for (const relationship of this._relationships) {
            if (!this._concepts.has(relationship.source)) {
                violations.push(
                    `Relationship "${relationship.id}" references unknown source ConceptId "${relationship.source}"`
                );
            }
            if (!this._concepts.has(relationship.target)) {
                violations.push(
                    `Relationship "${relationship.id}" references unknown target ConceptId "${relationship.target}"`
                );
            }
        }

        if (violations.length > 0) {
            throw new OntologyRegistryError(
                `OntologyRegistry cross-reference validation failed with ${violations.length} violation(s):\n` +
                violations.map(v => `  • ${v}`).join("\n")
            );
        }
    }
}