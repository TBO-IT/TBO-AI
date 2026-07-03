import { hospitalityOntology, metricId } from "./ontology/index.js";
import { METRIC_SQL_FORMULAS } from "./execution/ExecutionRegistry.js";
import { MetricDefinition } from "./llmtypes.js";

export interface RegistryMetric extends MetricDefinition {
    interpretation?: string;
}

/**
 * Adapter bridging the new Business Ontology (definitions) and 
 * Execution Registry (SQL formulas).
 * Preserves backward compatibility for existing consumers like semanticLayer.ts.
 */
function buildLegacyMetricRegistry(): Record<string, RegistryMetric> {
    const registry: Record<string, RegistryMetric> = {};

    for (const [key, formula] of Object.entries(METRIC_SQL_FORMULAS)) {
        try {
            // Attempt to get the business definition from the ontology
            const metric = hospitalityOntology.getMetric(metricId(key.toUpperCase()));
            if (!metric) {
                throw new Error("Metric not found in ontology");
            }
            registry[key] = {
                name: metric.name,
                description: metric.description,
                formula: formula,
                interpretation: metric.interpretation ? 
                    (metric.polarity === "HIGHER_IS_BETTER" ? "Higher is better." : "Lower is better.") : undefined
            };
        } catch (e) {
            // Fallback for metrics not yet in ontology (e.g. conversions)
            // Just basic capitalized naming
            registry[key] = {
                name: key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                description: `Metric: ${key}`,
                formula: formula
            };
        }
    }
    
    // Hardcode specific overrides that don't match ontology ID exactly or are missing
    if (registry.searches) registry.searches.description = "Total number of searches conducted by users.";
    if (registry.bookings) registry.bookings.description = "Total number of bookings made.";
    if (registry.vouchered_bookings) registry.vouchered_bookings.description = "Total number of completed and vouchered bookings.";
    if (registry.cancelled_bookings) registry.cancelled_bookings.description = "Total number of cancelled bookings.";
    if (registry.total_sales) registry.total_sales.description = "Total sales value.";
    if (registry.vouchered_sales) registry.vouchered_sales.description = "Total sales value for vouchered bookings.";
    if (registry.cancel_sales) registry.cancel_sales.description = "Total sales value lost due to cancellations.";
    if (registry.l2b) registry.l2b.description = "Look-to-Book ratio, the percentage of searches that convert to bookings.";
    if (registry.l2v) registry.l2v.description = "Look-to-Voucher ratio, the percentage of searches that result in vouchered (completed) bookings.";

    return registry;
}

export const METRIC_REGISTRY = buildLegacyMetricRegistry();
