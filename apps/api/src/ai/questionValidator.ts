import { QuestionAnalysis, QuestionValidationResult } from "./questionTypes.js";
import { DatasetType } from "./datasetTypes.js";
import { DATASET_METRIC_AVAILABILITY } from "./questionKnowledge.js";
import { EnrichedSemanticLayer } from "./semanticLayer.js";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validates a parsed question against the semantic layer of the active dataset.
 * Accumulates all errors and suggestions.
 * 
 * NO call to Claude should be made if this returns valid=false.
 */
export function validateQuestion(
    parsedQuestion: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer
): QuestionValidationResult {
    const { datasetType } = semanticLayer;
    
    const errors: string[] = [];
    const suggestions: string[] = [];

    // ─── Check 1: Cross-Dataset Metrics ───────────────────────────────────────
    
    const availableMetrics = DATASET_METRIC_AVAILABILITY[datasetType] ?? [];
    const crossDataset = parsedQuestion.metrics.filter(m => {
        const existsInAnyDataset = Object.values(DATASET_METRIC_AVAILABILITY)
            .some(metrics => metrics.includes(m));
        return existsInAnyDataset && !availableMetrics.includes(m);
    });

    if (crossDataset.length > 0) {
        const names = crossDataset.map(m => m.replace(/_/g, " ")).join(", ");
        errors.push(`The metric(s) '${names}' exist in another dataset type but not in this ${datasetType} dataset.`);
        suggestions.push("Please use a dataset that contains these metrics.");
    }

    // ─── Check 2: Metric Availability ─────────────────────────────────────────

    const missingMetrics = parsedQuestion.metrics.filter(m => !availableMetrics.includes(m) && !crossDataset.includes(m));

    if (missingMetrics.length > 0) {
        const missingNames = missingMetrics.map(m => m.replace(/_/g, " ")).join(", ");
        errors.push(`Metric '${missingNames}' is not available in this dataset.`);
        
        if (availableMetrics.length > 0) {
            suggestions.push(`Try using one of the available metrics: ${availableMetrics.map(m => m.replace(/_/g, " ")).join(", ")}.`);
        }
    }

    // ─── Check 3: Dimension Availability ──────────────────────────────────────

    const availableDimensions = semanticLayer.dimensions;
    const missingDimensions = parsedQuestion.dimensions.filter(d => !availableDimensions.includes(d));

    if (missingDimensions.length > 0) {
        const missingNames = missingDimensions.join(", ");
        errors.push(`The dimension(s) '${missingNames}' are not present in this dataset.`);
        
        if (availableDimensions.length > 0) {
            suggestions.push(`Available dimensions are: ${availableDimensions.join(", ")}.`);
        } else {
            suggestions.push("This dataset does not appear to have any recognized business dimensions.");
        }
    }

    // ─── Check 4: Time Column Availability ────────────────────────────────────

    const hasTimeColumn =
        !!semanticLayer.primaryTimeDimension ||
        (semanticLayer.availableTimeColumns && semanticLayer.availableTimeColumns.length > 0);

    if (parsedQuestion.timeReferences.length > 0 && !hasTimeColumn) {
        errors.push("No time column exists in this dataset.");
        suggestions.push("Use a dataset containing date fields to answer time-based questions.");
    }

    // ─── Check 5: Root Cause Requirements ─────────────────────────────────────
    
    if (parsedQuestion.intent === "ROOT_CAUSE") {
        let missingRootCauseReqs = false;
        
        if (parsedQuestion.metrics.length === 0) {
            errors.push("Root cause analysis requires a specific metric to analyze.");
            missingRootCauseReqs = true;
        }
        if (parsedQuestion.dimensions.length === 0 && parsedQuestion.filters.length === 0) {
            errors.push("Root cause analysis requires a dimension or specific filter to investigate.");
            missingRootCauseReqs = true;
        }
        
        if (missingRootCauseReqs) {
            suggestions.push("For root cause questions, please specify the metric and the specific area (e.g., 'Why did bookings drop in Paris?').");
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        suggestions
    };
}
