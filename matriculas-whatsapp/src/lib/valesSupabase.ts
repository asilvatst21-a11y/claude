import { createClient } from "@supabase/supabase-js";

// Mesmo projeto Supabase do app principal, agora com a chave ANÔNIMA.
// Antes usava a service_role via VITE_SUPABASE_SERVICE_KEY, que o Vite embutia
// no bundle público — qualquer visitante conseguia extrair a chave-mestra e
// ignorar todo o RLS. As tabelas usadas por este cliente recebem acesso à
// anon pela migração supabase-c1-anon-vales.sql.
const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const valesSupabase = createClient(url, key);
