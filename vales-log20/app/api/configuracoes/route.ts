import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("configuracoes")
    .select("chave, valor");

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.chave] = row.valor ?? "";
  return Response.json(map);
}

export async function POST(request: Request) {
  const body = await request.json();
  const supabase = await createServiceClient();

  const rows = Object.entries(body as Record<string, string>).map(([chave, valor]) => ({
    chave,
    valor,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("configuracoes")
    .upsert(rows, { onConflict: "chave" });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
