import axios from "axios";

export const api = axios.create({
    baseURL: "http://localhost:3000",
});

export async function getAnalysis() {
    const response = await api.get(
        "/test-analysis"
    );

    return response.data;
}