export interface PerformanceMetric {
    name: string;
    volume: number;
    winRate: number;
}

export interface DatasetSummary {
    rowCount: number;
    winRate: number;
    medianPriceDiff: number;

    apwBreakdown: PerformanceMetric[];
    chainPerformance: PerformanceMetric[];
    supplierPerformance: PerformanceMetric[];
}