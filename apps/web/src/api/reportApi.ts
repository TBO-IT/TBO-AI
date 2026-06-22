import { api } from "./client";

export interface Report {
    id: string;
    title: string;
    content: string; // The raw markdown/text content from the Copilot response
    datasetId?: string;
    datasetName?: string;
    createdAt: string;
}

export async function getReports(): Promise<Report[]> {
    const response = await api.get("/reports");
    return response.data;
}

export async function getReport(id: string): Promise<Report> {
    const response = await api.get(`/reports/${id}`);
    return response.data;
}

export async function saveReport(data: { title: string; content: string; datasetId?: string }): Promise<Report> {
    const response = await api.post("/reports", data);
    return response.data;
}

export async function deleteReport(id: string): Promise<void> {
    await api.delete(`/reports/${id}`);
}
