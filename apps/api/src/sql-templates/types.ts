export interface ResolvedSlots {
    [key: string]: any;
}

export interface SqlQuery {
    query: string;
    params: any[];
}

export interface TemplateDefinition {
    id: string;
    patterns: RegExp[];
    slots: string[];
    generateSql: (resolvedSlots: ResolvedSlots) => SqlQuery;
    formatAnswer: (rows: any[], resolvedSlots: ResolvedSlots) => string;
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
    template_id?: string;
    confidence?: number;
    latency_ms?: number;
    reason?: string;
}
