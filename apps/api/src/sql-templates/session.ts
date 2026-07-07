export interface SessionContext {
    metric?: string;
    filters?: any[];
    groupBy?: string[];
    lastQueryType?: string;
    lastResolvedSlots?: any;
    lastResultsCount?: number;
    timestamp: number;
}

const sessionCache = new Map<string, SessionContext>();
const MAX_SESSIONS = 1000;
const TTL_MS = 1000 * 60 * 60 * 2; // 2 hours

export const sessionManager = {
    getContext(userId: string, datasetId: string): SessionContext | undefined {
        const key = `${datasetId}_${userId}`;
        const ctx = sessionCache.get(key);
        if (ctx && Date.now() - ctx.timestamp < TTL_MS) {
            // refresh
            ctx.timestamp = Date.now();
            sessionCache.delete(key);
            sessionCache.set(key, ctx);
            return ctx;
        }
        if (ctx) sessionCache.delete(key);
        return undefined;
    },

    setContext(userId: string, datasetId: string, context: Partial<SessionContext>) {
        const key = `${datasetId}_${userId}`;
        const existing = this.getContext(userId, datasetId) || { timestamp: Date.now() };
        
        if (sessionCache.size >= MAX_SESSIONS) {
            // Evict oldest
            const oldestKey = sessionCache.keys().next().value;
            if (oldestKey) sessionCache.delete(oldestKey);
        }

        sessionCache.set(key, { ...existing, ...context, timestamp: Date.now() });
    },

    clearContext(userId: string, datasetId: string) {
        sessionCache.delete(`${datasetId}_${userId}`);
    }
};
