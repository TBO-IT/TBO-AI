import { createClient } from "@supabase/supabase-js";
let _supabaseInstance = null;
export function getSupabaseClient() {
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
export const supabase = new Proxy({}, {
    get: (target, prop) => {
        return getSupabaseClient()[prop];
    }
});
