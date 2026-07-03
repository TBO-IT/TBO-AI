import { AnalysisDefinition } from "./AnalysisDefinition.js";
import { CapabilityType } from "../ontology/types.js";

export class AnalysisRegistry {
    private analyses = new Map<string, AnalysisDefinition>();

    /**
     * Register a new analysis definition.
     */
    register(analysis: AnalysisDefinition): void {
        this.analyses.set(analysis.id, analysis);
    }

    /**
     * Get an analysis by its unique ID.
     */
    get(id: string): AnalysisDefinition | undefined {
        return this.analyses.get(id);
    }

    /**
     * Return every registered analysis.
     */
    getAll(): AnalysisDefinition[] {
        return Array.from(this.analyses.values());
    }

    /**
     * Return every analysis supporting a capability.
     */
    getByCapability(capability: CapabilityType): AnalysisDefinition[] {
        return this.getAll().filter(
            analysis => analysis.capability === capability
        );
    }

    /**
     * Find every analysis that requires a metric.
     */
    getByMetric(metricId: string): AnalysisDefinition[] {
        return this.getAll().filter(analysis =>
            analysis.requiredMetrics.some(
                metric => metric.metricId === metricId
            )
        );
    }

    /**
     * Check whether an analysis exists.
     */
    has(id: string): boolean {
        return this.analyses.has(id);
    }
}