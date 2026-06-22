import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
    if (!_supabaseInstance) {
        const rawUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!rawUrl || !serviceKey) {
            throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.");
        }
        
        const cleanedUrl = rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
        _supabaseInstance = createClient(cleanedUrl, serviceKey);
    }
    return _supabaseInstance;
}

// Keep the old export as a getter to avoid breaking existing imports
export const supabase = new Proxy({} as SupabaseClient, {
    get: (target, prop) => {
        return (getSupabaseClient() as any)[prop];
    }
});