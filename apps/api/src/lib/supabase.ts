import { createClient } from "@supabase/supabase-js";

console.log("SUPABASE_URL =", process.env.SUPABASE_URL);
console.log(
    "SERVICE KEY EXISTS =",
    !!process.env.SUPABASE_SERVICE_ROLE_KEY
);

const rawUrl = process.env.SUPABASE_URL!;
const cleanedUrl = rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");

export const supabase = createClient(
    cleanedUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);