import { api } from "./client";

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  role: string;
  datasetsUploaded: number;
  queriesRun: number;
}

export async function getProfile(): Promise<UserProfile> {
  const response = await api.get("/api/profile");
  return response.data;
}
