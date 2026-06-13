import { createClient } from "@supabase/supabase-js";

// Uses the same Supabase project as the main app.
// VITE_SUPABASE_SERVICE_KEY must be the service_role key (not the anon key)
// so batch imports and writes bypass RLS.
const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_SERVICE_KEY as string;

export const valesSupabase = createClient(url, key);
