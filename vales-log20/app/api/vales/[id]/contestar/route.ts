import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { motivo } = await request.json();

    if (!motivo?.trim()) {
      return NextResponse.json({ error: "Motivo é obrigatório" }, { status: 400 });
    }

    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from("vales")
      .update({
        contestado: true,
        motivo_contestacao: motivo.trim(),
        contestado_em: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, contestado, motivo_contestacao, contestado_em")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    );
  }
}
