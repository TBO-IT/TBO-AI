import { api } from "./client";

export function setupAuthInterceptor(
    getToken: () => Promise<string | null>
) {
    api.interceptors.request.use(
        async (config) => {
            const token = await getToken();

            if (token) {
                config.headers.Authorization =
                    `Bearer ${token}`;
            }

            return config;
        }
    );
}