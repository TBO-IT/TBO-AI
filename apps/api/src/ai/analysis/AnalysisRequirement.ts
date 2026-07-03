export interface AnalysisRequirement {
    metricId: string;

    required: boolean;

    purpose: string;

    weight?: number;
}