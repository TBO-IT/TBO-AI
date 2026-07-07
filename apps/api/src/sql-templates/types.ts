export interface ResolvedSlots {
    [key: string]: any;
}

export interface SqlQuery {
    query: string;
    params: any[];
}

export interface ChartConfig {
    valueLabel: string;
    valueFormat: "percent" | "currency" | "number";
    sortDirection?: "asc" | "desc" | "none";
}

export interface ChartDefinition {
    type: "bar" | "line" | "pie" | "comparison";
    data: { name: string; value: number; secondaryValue?: number; [key: string]: any }[];
    config: ChartConfig;
}

export interface TableDefinition {
    columns: string[];
    rows: any[];
}

export interface Tier0StructuredResponse {
    answer: string;
    chart?: ChartDefinition;
    table?: TableDefinition;
    highlight?: any;
}

export interface TemplateDefinition {
    id: string;
    patterns: RegExp[];
    slots: string[];
    generateSql: (resolvedSlots: ResolvedSlots) => SqlQuery;
    formatAnswer: (rows: any[], resolvedSlots: ResolvedSlots) => Tier0StructuredResponse | string;
}

export interface ClassifierResult {
    matched: boolean;
    template_id?: string;
    slots?: Record<string, string>;
    confidence?: number;
    reason?: string;
}

export interface Tier0Result {
    handled: boolean;
    response?: string;
    chart?: ChartDefinition;
    table?: TableDefinition;
    template_id?: string;
    results?: any[];
    confidence?: number;
    latency_ms?: number;
    reason?: string;
}
