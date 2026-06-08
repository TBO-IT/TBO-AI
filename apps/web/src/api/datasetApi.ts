import { api } from "./client";

export async function getDatasets() {
  const response = await api.get("/dataset");
  return response.data;
}
