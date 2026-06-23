import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseEscalaBuffer } from "@/lib/tml-parser";
import { isSalaTML } from "@/lib/tml";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const escalas = parseEscalaBuffer(buffer).filter((e) => isSalaTML(e.sala));

    if (escalas.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma escala de Interior/Petrópolis encontrada na planilha" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();
    const { error } = await supabase.from("escalas_tml").upsert(
      escalas.map((e) => ({
        mapa: e.mapa,
        sala: e.sala,
        placa: e.placa,
        matricula: e.matricula,
        data_entrega: e.dataEntrega,
        importado_em: new Date().toISOString(),
      })),
      { onConflict: "mapa" }
    );

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, total: escalas.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno ao importar escala" },
      { status: 500 }
    );
  }
}
