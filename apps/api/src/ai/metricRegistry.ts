import { MetricDefinition } from "./llmtypes.js";

export interface RegistryMetric extends MetricDefinition {
    interpretation?: string;
}

export const METRIC_REGISTRY: Record<string, RegistryMetric> = {
    win_rate: {
        name: "Win Rate",
        description: "Percentage of observations where TBO wins.",
        interpretation: "Higher is better.",
        formula: 'AVG(CASE WHEN "Competitive Status" = \'Winning\' THEN 1.0 ELSE 0.0 END) * 100.0'
    },
    avg_price_diff: {
        name: "Average Price Difference",
        description: "Average percentage price difference between third party and TBO.",
        formula: "AVG(CAST(price_diff_perc AS DOUBLE))"
    },
    median_price_diff: {
        name: "Median Price Difference",
        description: "Median percentage price difference between third party and TBO.",
        formula: "MEDIAN(CAST(price_diff_perc AS DOUBLE))"
    },
    searches: {
        name: "Searches",
        description: "Total number of searches conducted by users.",
        formula: "SUM(CAST(Searches AS BIGINT))"
    },
    bookings: {
        name: "Bookings",
        description: "Total number of bookings made.",
        formula: "SUM(CAST(Bookings AS BIGINT))"
    },
    vouchered_bookings: {
        name: "Vouchered Bookings",
        description: "Total number of completed and vouchered bookings.",
        formula: 'SUM(CAST("Vouchered Bookings" AS BIGINT))'
    },
    cancelled_bookings: {
        name: "Cancelled Bookings",
        description: "Total number of cancelled bookings.",
        formula: 'SUM(CAST("Cancelled  Bookings" AS BIGINT))'
    },
    total_sales: {
        name: "Total Sales",
        description: "Total sales value.",
        formula: 'SUM(CAST("Total Sales" AS DOUBLE))'
    },
    vouchered_sales: {
        name: "Vouchered Sales",
        description: "Total sales value for vouchered bookings.",
        formula: 'SUM(CAST("Vouchered Sales" AS DOUBLE))'
    },
    cancel_sales: {
        name: "Cancel Sales",
        description: "Total sales value lost due to cancellations.",
        formula: 'SUM(CAST("Cancel Sales" AS DOUBLE))'
    },
    l2b: {
        name: "L2B",
        description: "Look-to-Book ratio, the percentage of searches that convert to bookings.",
        formula: '(SUM(CAST(Bookings AS DOUBLE)) / NULLIF(SUM(CAST(Searches AS DOUBLE)), 0.0)) * 100.0'
    },
    l2v: {
        name: "L2V",
        description: "Look-to-Voucher ratio, the percentage of searches that result in vouchered (completed) bookings.",
        formula: '(SUM(CAST("Vouchered Bookings" AS DOUBLE)) / NULLIF(SUM(CAST(Searches AS DOUBLE)), 0.0)) * 100.0'
    }
};
