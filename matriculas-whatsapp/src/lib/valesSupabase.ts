import { createClient } from "@supabase/supabase-js";

const valesUrl = import.meta.env.VITE_VALES_SUPABASE_URL as string;
const valesKey = import.meta.env.VITE_VALES_SUPABASE_SERVICE_KEY as string;

export const valesSupabase = createClient(valesUrl, valesKey);
