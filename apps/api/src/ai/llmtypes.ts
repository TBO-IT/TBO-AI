export interface DatasetColumn {
    column_name: string;
    column_type: string;
}

export interface BusinessDefinition {
    name: string;
    definition: string;
}

export interface MetricDefinition {
    name: string;
    description: string;
    formula: string;
}

export interface SemanticLayer {
    primaryTimeDimension: string;

    /** All date/timestamp columns detected in the schema */
    availableTimeColumns: string[];

    businessDefinitions: BusinessDefinition[];

    metrics: MetricDefinition[];
}