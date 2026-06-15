import { DatasetType } from "./datasetTypes.js";

// ─── Analytical Intent Types ──────────────────────────────────────────────────

export type QuestionIntent =
    | "ROOT_CAUSE"
    | "TREND"
    | "COMPARISON"
    | "RANKING"
    | "SUMMARY"
    | "BREAKDOWN"
    | "CORRELATION"
    | "ANOMALY";

// ─── Component Extraction Types ───────────────────────────────────────────────

export type QuestionMetric = string;
export type QuestionDimension = string;
export type QuestionTimeReference = string;

// ─── Parsed Question ──────────────────────────────────────────────────────────

/**
 * The structured output of the Question Analyzer.
 * Represents what the user *actually wants* in canonical business terms.
 */
export interface QuestionAnalysis {
    /** Canonical metric keys extracted (e.g. ["win_rate", "l2b"]) */
    metrics: QuestionMetric[];

    /** Canonical dimension keys extracted (e.g. ["destination", "supplier"]) */
    dimensions: QuestionDimension[];

    /** Literal filter values extracted (e.g. ["Pattaya", "Bangkok"]) */
    filters: string[];

    /** Raw time reference strings if detected (e.g. ["April", "Q2", "last month"]) */
    timeReferences: QuestionTimeReference[];

    /** Detected analytical intent */
    intent: QuestionIntent;

    /** The original unmodified question */
    originalQuestion: string;
}

// ─── Validation Result ────────────────────────────────────────────────────────

/**
 * Result of the Question Validator gate.
 * If valid=false, Claude must NOT be called.
 */
export interface QuestionValidationResult {
    valid: boolean;
    errors: string[];
    suggestions: string[];
}

/**
 * Custom error thrown when validation fails before Claude generation.
 */
export class QuestionValidationError extends Error {
    public readonly validationResult: QuestionValidationResult;

    constructor(result: QuestionValidationResult) {
        super("Question failed analytical validation: " + result.errors.join("; "));
        this.name = "QuestionValidationError";
        this.validationResult = result;
    }
}

// ─── Synonym Entry ────────────────────────────────────────────────────────────

/**
 * A single synonym group in the knowledge registry.
 * Multiple phrases all map to one canonical key.
 */
export interface SynonymEntry {
    /** The canonical internal key (e.g. "win_rate", "destination") */
    canonicalKey: string;

    /** Type: whether this resolves to a metric or a dimension */
    type: "metric" | "dimension";

    /** All synonymous phrases that map to this key */
    synonyms: string[];
}

// ─── Dataset Metric Availability Map ─────────────────────────────────────────

/**
 * Maps each DatasetType to the set of canonical metric keys it supports.
 * Used by the validator to check cross-dataset availability.
 */
export type DatasetMetricAvailability = Record<DatasetType, string[]>;
