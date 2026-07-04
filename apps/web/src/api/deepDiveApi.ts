import { api } from "./client";

export interface MetricData {
    value: number;
    delta: number;
    trend: "up" | "down" | "flat";
}

export interface DeepDiveData {
    id: string;
    name: string;
    type: "HOTEL" | "SUPPLIER";
    metrics: {
        winRate: MetricData;
        priceCompetitiveness: MetricData;
        volumeShare: MetricData;
        totalQueries: MetricData;
    };
    trendData?: {
        winRate: Array<{ date: string; current: number; market: number }>;
        priceGap: Array<{ date: string; current: number; market: number }>;
        apw: Array<{ date: string; d10: number; d15: number; d30: number; d45: number; d60: number; d90: number }>;
    };
    distribution?: {
        winMargin: { avg: number; median: number };
        lossMargin: { avg: number; median: number };
        segments: { winHigh: number; winLow: number; within: number; lossLow: number; lossHigh: number };
    };
    insights?: string[];
    // specific to hotels
    topSuppliers?: Array<{ name: string; winRate: number; share: number }>;
    riskAssessment?: { level: string; primaryRisk: string };
    // specific to suppliers
    topHotels?: Array<{ name: string; winRate: number; share: number }>;
    opportunityAssessment?: { level: string; primaryOpportunity: string };

    // specific to chains
    topProperties?: Array<{ name: string; winRate: number; share: number }>;
}

export async function getHotelDeepDive(id: string, datasetId: string): Promise<DeepDiveData> {
    const response = await api.get(`/deep-dives/hotel/${encodeURIComponent(id)}?datasetId=${datasetId}`);
    return response.data;
}

export async function getSupplierDeepDive(id: string, datasetId: string): Promise<DeepDiveData> {
    const response = await api.get(`/deep-dives/supplier/${encodeURIComponent(id)}?datasetId=${datasetId}`);
    return response.data;
}

export async function getChainDeepDive(id: string, datasetId: string): Promise<DeepDiveData> {
    const response = await api.get(`/deep-dives/chain/${encodeURIComponent(id)}?datasetId=${datasetId}`);
    return response.data;
}
