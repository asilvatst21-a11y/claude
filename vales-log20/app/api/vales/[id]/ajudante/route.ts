import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: valeId } = await params;
    const { ajudante_id } = await request.json();

    if (!ajudante_id) {
      return NextResponse.json({ error: "ajudante_id é obrigatório" }, { status: 400 });
    }

    const supabase = await createServiceClient();

    // Get current max posicao for this vale
    const { data: existing } = await supabase
      .from("vale_ajudantes")
      .select("posicao")
      .eq("vale_id", valeId)
      .order("posicao", { ascending: false })
      .limit(1);

    const nextPosicao = existing && existing.length > 0 ? existing[0].posicao + 1 : 1;

    const { error } = await supabase
      .from("vale_ajudantes")
      .upsert(
        { vale_id: valeId, ajudante_id, posicao: nextPosicao },
        { onConflict: "vale_id,ajudante_id", ignoreDuplicates: true }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    );
  }
}
