import { QuestionAnalysis } from "../ai/questionTypes.js";
import { EnrichedSemanticLayer } from "../ai/semanticLayer.js";
import { buildWhereClause } from "../ai/filterBuilder.js";

// ─── Time Intelligence Engine ──────────────────────────────────────────────────
// Handles period-over-period queries: WoW, MoM, YoY
// Generates SQL that compares current period vs previous period
// ────────────────────────────────────────────────────────────────────────────────

export type TimePeriod = "WoW" | "MoM" | "YoY" | "custom";

export interface TimeIntelligenceResult {
    sql: string;
    explanation: string;
    period: TimePeriod;
    currentPeriod: { start: string; end: string };
    previousPeriod: { start: string; end: string };
}

// ─── Period Detection ───────────────────────────────────────────────────────────

/**
 * Detect what time period the user is asking about
 */
export function detectTimePeriod(question: string): TimePeriod {
    const q = question.toLowerCase();

    // Check for explicit period mentions (order matters - check longer first)
    if (q.includes("week over week") || q.includes("week-over-week") || /\bwow\b/.test(q)) {
        return "WoW";
    }
    if (q.includes("month over month") || q.includes("month-over-month") || /\bmom\b/.test(q)) {
        return "MoM";
    }
    if (q.includes("year over year") || q.includes("year-over-year") || /\byoy\b/.test(q)) {
        return "YoY";
    }

    // Check for relative time references
    if (q.includes("last week") || q.includes("this week") || q.includes("weekly")) {
        return "WoW";
    }
    if (q.includes("last month") || q.includes("this month") || q.includes("monthly")) {
        return "MoM";
    }
    if (q.includes("last year") || q.includes("this year") || q.includes("yearly") || q.includes("annually")) {
        return "YoY";
    }

    // Default - check if there's a date column
    return "WoW"; // Default to WoW for competitiveness data
}

/**
 * Calculate period dates based on detected type
 */
function calculatePeriods(period: TimePeriod, referenceDate: Date = new Date()): {
    current: { start: Date; end: Date };
    previous: { start: Date; end: Date };
} {
    const now = new Date(referenceDate);

    switch (period) {
        case "WoW": {
            // Current week: Monday to Sunday of current week
            const dayOfWeek = now.getDay();
            const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const currentStart = new Date(now);
            currentStart.setDate(now.getDate() + mondayOffset);
            currentStart.setHours(0, 0, 0, 0);

            const currentEnd = new Date(currentStart);
            currentEnd.setDate(currentStart.getDate() + 6);

            // Previous week
            const previousStart = new Date(currentStart);
            previousStart.setDate(currentStart.getDate() - 7);
            const previousEnd = new Date(currentStart);
            previousEnd.setDate(currentStart.getDate() - 1);

            return { current: { start: currentStart, end: currentEnd }, previous: { start: previousStart, end: previousEnd } };
        }

        case "MoM": {
            // Current month
            const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

            // Previous month
            const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const previousEnd = new Date(now.getFullYear(), now.getMonth(), 0);

            return { current: { start: currentStart, end: currentEnd }, previous: { start: previousStart, end: previousEnd } };
        }

        case "YoY": {
            // Current year (Jan 1 to today)
            const currentStart = new Date(now.getFullYear(), 0, 1);
            const currentEnd = now;

            // Previous year (same period)
            const previousStart = new Date(now.getFullYear() - 1, 0, 1);
            const previousEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

            return { current: { start: currentStart, end: currentEnd }, previous: { start: previousStart, end: previousEnd } };
        }

        default:
            return calculatePeriods("WoW", referenceDate);
    }
}

// ─── SQL Generation ───────────────────────────────────────────────────────────

/**
 * Generate SQL for period-over-period comparison
 */
export function generateTimeIntelligenceSql(
    analysis: QuestionAnalysis,
    semanticLayer: EnrichedSemanticLayer,
    period?: TimePeriod
): TimeIntelligenceResult | null {
    const detectedPeriod = period || detectTimePeriod(analysis.originalQuestion);
    const { current, previous } = calculatePeriods(detectedPeriod);

    // Format dates for SQL
    const formatDate = (d: Date) => {
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${d.getFullYear()}-${month}-${day}`;
    };

    const currentStartStr = formatDate(current.start);
    const currentEndStr = formatDate(current.end);
    const previousStartStr = formatDate(previous.start);
    const previousEndStr = formatDate(previous.end);

    // Find the date column
    const dateColumn = semanticLayer.allColumns.find(c =>
        c.column_name.toLowerCase().includes("date") ||
        c.column_name.toLowerCase().includes("scraped")
    )?.column_name || "scraped_date";

    // Find the metric column
    const metricKey = analysis.metrics[0] || semanticLayer.metricKeys[0] || "price_diff_perc";
    const metricColumn = resolveMetricColumn(metricKey, semanticLayer);

    if (!metricColumn) {
        console.warn(`[TimeIntelligence] Could not resolve metric: ${metricKey}`);
        return null;
    }

    // Find dimension columns for grouping
    const dimensionColumns = analysis.dimensions
        .map(d => resolveDimensionColumn(d, semanticLayer))
        .filter(Boolean) as string[];

    // Build the WHERE clause for filters (excluding date)
    const filtersExcludingDate = analysis.filters.filter(f =>
        f.dimension.toLowerCase() !== "date" &&
        f.dimension.toLowerCase() !== "time"
    );
    const schemaColumns = semanticLayer.allColumns.map(c => c.column_name);
    const whereClause = buildWhereClause(filtersExcludingDate, schemaColumns);

    // Generate SQL that calculates both periods and the change
    const groupBy = dimensionColumns.length > 0
        ? `GROUP BY ${dimensionColumns.join(", ")}`
        : "";

    // For win rate, we need a different calculation
    if (metricKey === "win_rate" || metricColumn.toLowerCase().includes("status")) {
        const sql = `
-- Current Period (${detectedPeriod})
SELECT
    ${dimensionColumns.length > 0 ? dimensionColumns.join(", ") + ", " : ""}
    COUNT(*) as current_count,
    SUM(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) as current_wins,
    ROUND(SUM(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 2) as current_rate
FROM read_csv_auto('*')
WHERE ${dateColumn} >= '${currentStartStr}' AND ${dateColumn} <= '${currentEndStr}'
${whereClause ? "AND " + whereClause : ""}
${groupBy}

UNION ALL

-- Previous Period (${detectedPeriod})
SELECT
    ${dimensionColumns.length > 0 ? dimensionColumns.join(", ") + ", " : ""}
    COUNT(*) as previous_count,
    SUM(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) as previous_wins,
    ROUND(SUM(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 2) as previous_rate
FROM read_csv_auto('*')
WHERE ${dateColumn} >= '${previousStartStr}' AND ${dateColumn} <= '${previousEndStr}'
${whereClause ? "AND " + whereClause : ""}
${groupBy}
        `.trim();

        return {
            sql,
            explanation: `Week-over-week win rate comparison: ${currentStartStr} to ${currentEndStr} vs ${previousStartStr} to ${previousEndStr}`,
            period: detectedPeriod,
            currentPeriod: { start: currentStartStr, end: currentEndStr },
            previousPeriod: { start: previousStartStr, end: previousEndStr }
        };
    }

    // For price difference, use average
    const sql = `
-- Current Period (${detectedPeriod})
SELECT
    ${dimensionColumns.length > 0 ? dimensionColumns.join(", ") + ", " : ""}
    ROUND(AVG(${metricColumn}), 2) as current_value,
    COUNT(*) as current_count
FROM read_csv_auto('*')
WHERE ${dateColumn} >= '${currentStartStr}' AND ${dateColumn} <= '${currentEndStr}'
${whereClause ? "AND " + whereClause : ""}
${groupBy}

UNION ALL

-- Previous Period (${detectedPeriod})
SELECT
    ${dimensionColumns.length > 0 ? dimensionColumns.join(", ") + ", " : ""}
    ROUND(AVG(${metricColumn}), 2) as previous_value,
    COUNT(*) as previous_count
FROM read_csv_auto('*')
WHERE ${dateColumn} >= '${previousStartStr}' AND ${dateColumn} <= '${previousEndStr}'
${whereClause ? "AND " + whereClause : ""}
${groupBy}
    `.trim();

    return {
        sql,
        explanation: `${detectedPeriod} comparison: ${currentStartStr} to ${currentEndStr} vs ${previousStartStr} to ${previousEndStr}`,
        period: detectedPeriod,
        currentPeriod: { start: currentStartStr, end: currentEndStr },
        previousPeriod: { start: previousStartStr, end: previousEndStr }
    };
}

/**
 * Resolve canonical metric key to physical column
 */
function resolveMetricColumn(metricKey: string, semanticLayer: EnrichedSemanticLayer): string | null {
    const mapping = semanticLayer.columnMappings;
    for (const [physical, canonical] of Object.entries(mapping)) {
        if (canonical === metricKey || physical.toLowerCase().includes(metricKey.toLowerCase())) {
            return physical;
        }
    }

    // Fallback: look in metrics
    const metric = semanticLayer.metrics.find(m =>
        m.name.toLowerCase().replace(/\s+/g, "_") === metricKey ||
        m.name.toLowerCase().includes(metricKey.replace(/_/g, " "))
    );
    return metric?.formula || null;
}

/**
 * Resolve canonical dimension to physical column
 */
function resolveDimensionColumn(dimension: string, semanticLayer: EnrichedSemanticLayer): string | null {
    const mapping = semanticLayer.columnMappings;
    for (const [physical, canonical] of Object.entries(mapping)) {
        if (canonical === dimension || physical.toLowerCase().includes(dimension.toLowerCase())) {
            return physical;
        }
    }

    // Fallback: look in dimensions
    const dim = semanticLayer.dimensions.find(d =>
        d.toLowerCase() === dimension.toLowerCase()
    );
    return dim || null;
}

/**
 * Check if question requires time intelligence
 */
export function requiresTimeIntelligence(question: string): boolean {
    const period = detectTimePeriod(question);
    return period !== "WoW" || question.toLowerCase().includes("week");
}