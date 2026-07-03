// ─────────────────────────────────────────────────────────────────────────────
// bootstrap.ts
//
// WHY THIS FILE EXISTS:
//   The bootstrap module is the assembly point of the ontology. It imports all
//   data files, creates a single OntologyRegistry instance, registers every
//   concept, metric, capability, and relationship, then seals the registry.
//
//   The result is a singleton -- a frozen, fully-validated, query-ready
//   domain model -- exported as `hospitalityOntology`.
//
// RESPONSIBILITY:
//   - Instantiate the OntologyRegistry.
//   - Register all data in deterministic order (metrics and capabilities before
//     concepts and relationships, because concepts reference metric/capability IDs
//     and cross-reference validation runs at seal time).
//   - Call `registry.seal()` to trigger synonym index construction and
//     cross-reference validation.
//   - Export the sealed singleton as `hospitalityOntology`.
//   - Export a `getOntologySummary()` helper for startup health checks.
//
// REGISTRATION ORDER:
//   The OntologyRegistry cross-reference validation runs during `seal()`.
//   We use the following order for readability and intent clarity:
//     1. Metrics     (foundation -- capabilities and concepts reference these)
//     2. Capabilities (reference metrics)
//     3. Concepts    (reference metrics and capabilities)
//     4. Relationships (reference concepts)
//
// WHY A MODULE-LEVEL SINGLETON:
//   The ontology is conceptually constant for the lifetime of the process.
//   Node.js module caching ensures every importer gets the same instance.
//   No dependency injection framework is needed for this layer.
//
// FUTURE EXTENSIBILITY:
//   - Add `retailOntology` export from a parallel `bootstrapRetail.ts` file.
//   - Add `mergeOntologies(a, b)` when cross-industry concepts need to be shared.
// ─────────────────────────────────────────────────────────────────────────────

import { OntologyRegistry, OntologyRegistryError } from "./OntologyRegistry.js";
import { OntologySummary } from "./types.js";

import { ALL_METRICS }       from "./data/metrics.js";
import { ALL_CAPABILITIES }  from "./data/capabilities.js";
import { ALL_CONCEPTS }      from "./data/concepts.js";
import { ALL_RELATIONSHIPS } from "./data/relationships.js";

// ─── Bootstrap Function ───────────────────────────────────────────────────────

/**
 * Assembles and seals the hospitality business ontology registry.
 *
 * Called once at module load time. The sealed registry is exported as the
 * `hospitalityOntology` singleton.
 *
 * @throws OntologyRegistryError if cross-reference validation fails.
 */
function bootstrap(): OntologyRegistry {
    const registry = new OntologyRegistry();

    try {
        for (const metric of ALL_METRICS) {
            registry.registerMetric(metric);
        }

        for (const capability of ALL_CAPABILITIES) {
            registry.registerCapability(capability);
        }

        for (const concept of ALL_CONCEPTS) {
            registry.registerConcept(concept);
        }

        for (const relationship of ALL_RELATIONSHIPS) {
            registry.registerRelationship(relationship);
        }

        registry.seal();

    } catch (error) {
        if (error instanceof OntologyRegistryError) {
            throw new OntologyRegistryError(
                `[Ontology Bootstrap] Failed to assemble the hospitality ontology.\n` +
                `This indicates a data integrity error in the ontology data files.\n` +
                `Original error:\n${error.message}`
            );
        }
        throw error;
    }

    return registry;
}

// ─── Singleton ────────────────────────────────────────────────────────────────
//
// `hospitalityOntology` is the single, sealed, fully-validated instance of the
// business ontology for the hospitality industry.
//
// All intelligence layer components must import and use this singleton.
// Node.js module caching guarantees this is only instantiated once per process.

export const hospitalityOntology: OntologyRegistry = bootstrap();

// ─── Convenience Helpers ──────────────────────────────────────────────────────

/**
 * Returns a diagnostic summary of the hospitality ontology registry.
 *
 * @example
 * const summary = getOntologySummary();
 * console.log(`Ontology loaded: ${summary.conceptCount} concepts, ${summary.metricCount} metrics`);
 */
export function getOntologySummary(): OntologySummary {
    return hospitalityOntology.getSummary();
}
