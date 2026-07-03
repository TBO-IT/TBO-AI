import { BusinessObjective } from "./BusinessObjective.js";

/**
 * Registry for Business Objectives.
 * Acts as the centralized store for all high-level analytical goals.
 */
export class ObjectiveRegistry {
    private objectives = new Map<string, BusinessObjective>();

    /**
     * Register a new business objective.
     */
    register(objective: BusinessObjective): void {
        this.objectives.set(objective.id, objective);
    }

    /**
     * Get an objective by its unique ID.
     */
    get(id: string): BusinessObjective | undefined {
        return this.objectives.get(id);
    }

    /**
     * Return every registered objective.
     */
    getAll(): BusinessObjective[] {
        return Array.from(this.objectives.values());
    }

    /**
     * Check whether an objective exists.
     */
    has(id: string): boolean {
        return this.objectives.has(id);
    }
}
