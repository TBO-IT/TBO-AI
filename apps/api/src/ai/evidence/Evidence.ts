import { EvidenceType } from "./EvidenceType.js";

export interface Evidence {

    id: string;

    type: EvidenceType;

    name: string;

    description: string;

    metricId?: string;

    value?: unknown;

    confidence?: number;

    source?: string;

    metadata?: Record<string, unknown>;
}