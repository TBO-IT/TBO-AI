// ─────────────────────────────────────────────────────────────────────────────
// index.ts
//
// WHY THIS FILE EXISTS:
//   The barrel export for the entire Business Ontology layer. This is the single
//   import point for any component outside the ontology directory.
//
// RESPONSIBILITY:
//   Re-export every public API surface from the ontology:
//     - The assembled singleton (hospitalityOntology, getOntologySummary)
//     - All interfaces (BusinessConcept, BusinessMetric, BusinessCapability, BusinessRelationship)
//     - All types and enums (ConceptType, MetricType, CapabilityType, etc.)
//     - All branded ID types and factory helpers
//     - The registry class and its error type
//
// DESIGN DECISIONS:
//   - Named re-exports only — no wildcard `export *`. This makes the public API
//     surface explicit and prevents accidental leakage of internal types.
//   - The data files (data/concepts.ts, data/metrics.ts, etc.) are NOT exported
//     from this barrel. They are implementation details of the bootstrap process.
//     External consumers access data through the registry's query API, not by
//     importing raw data arrays. This enforces the encapsulation boundary.
//   - `OntologyRegistryError` IS exported — consumers may need to catch it in
//     tests or bootstrap validation contexts.
//
// IMPORT CONVENTION FOR CONSUMERS:
//   All imports from the ontology layer should use this barrel:
//
//     import {
//       hospitalityOntology,
//       ConceptType,
//       CapabilityType,
//       conceptId,
//       metricId,
//     } from "./ontology/index.js";
//
//   NEVER import directly from internal files like:
//
//     import { WIN_RATE_METRIC } from "./ontology/data/metrics.js";  // ❌ WRONG
//     import { BusinessConcept } from "./ontology/BusinessConcept.js"; // ❌ WRONG
//
//   This ensures internal reorganizations don't break consumers.
//
// FUTURE EXTENSIBILITY:
//   - When multi-industry support arrives, export `retailOntology` here as well.
//   - Add `createOntologyRegistry` export if consumer-side custom registries
//     are ever needed (e.g. for testing with a subset of the full ontology).
// ─────────────────────────────────────────────────────────────────────────────

// ── Singleton and helpers ─────────────────────────────────────────────────────
// The primary entry point for all consumers. Import `hospitalityOntology` and
// call its query methods — this is the primary interface to the domain model.

export {
    hospitalityOntology,
    getOntologySummary,
} from "./bootstrap.js";

// ── Registry class and error ──────────────────────────────────────────────────
// Exported so that:
//   - Tests can construct isolated registries with subsets of the full ontology.
//   - Bootstrap validation code can catch OntologyRegistryError specifically.
//   - Future multi-industry bootstraps can use the same registry class.

export {
    OntologyRegistry,
    OntologyRegistryError,
} from "./OntologyRegistry.js";

// ── Domain interfaces ─────────────────────────────────────────────────────────
// Type-only exports for components that need to type-check their usage of
// ontology objects without importing implementation details.

export type { BusinessConcept }      from "./BusinessConcept.js";
export type { BusinessMetric, MetricInterpretation } from "./BusinessMetric.js";
export type { BusinessCapability }   from "./BusinessCapability.js";
export type { BusinessRelationship } from "./BusinessRelationship.js";
export type { RelationshipCardinality } from "./BusinessRelationship.js";

// ── Enums ─────────────────────────────────────────────────────────────────────
// All enum values — used in switch statements, filters, and type guards
// throughout the intelligence layer.

export {
    ConceptType,
    MetricType,
    CapabilityType,
    RelationshipType,
    MetricPolarity,
    TimeGranularity,
    EvidenceKind,
} from "./types.js";

// ── Branded ID types ──────────────────────────────────────────────────────────
// Type-only exports — the brands carry no runtime representation.
// Exported so consumers can annotate function signatures correctly:
//
//   function resolveConceptId(id: ConceptId): BusinessConcept | undefined
//   function buildEvidence(metricId: MetricId): Evidence

export type {
    ConceptId,
    MetricId,
    CapabilityId,
    OntologySummary,
} from "./types.js";

// ── Factory helpers ───────────────────────────────────────────────────────────
// The only sanctioned way to create branded ID values.
// Exported for use in tests, the Entity Resolver, and the Analysis Registry.
//
//   const metric = hospitalityOntology.getMetric(metricId("WIN_RATE"));
//   const concept = hospitalityOntology.getConcept(conceptId("HOTEL"));

export {
    conceptId,
    metricId,
    capabilityId,
} from "./types.js";
