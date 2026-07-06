import { api } from "./client";

export interface UsageTimelineData {
    date: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    requests: number;
}

export interface UsageSummary {
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalRequests: number;
}

export interface UsageDataResponse {
    timeline: UsageTimelineData[];
    summary: UsageSummary;
}

export async function getUsageData(): Promise<UsageDataResponse> {
    const response = await api.get("/usage");
    return response.data;
}
