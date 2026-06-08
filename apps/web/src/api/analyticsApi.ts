import { api } from "./client";

export async function getAnalysis() {
    const response = await api.get(
        "/test-analysis"
    );

    return response.data;
}