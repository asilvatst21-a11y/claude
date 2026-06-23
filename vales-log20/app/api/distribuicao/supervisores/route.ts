import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("supervisores_tml")
      .select("*")
      .order("sala")
      .order("nome");

    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nome, sala, telefone } = body;

    if (!nome || !sala || !telefone) {
      return NextResponse.json(
        { error: "nome, sala e telefone são obrigatórios" },
        { status: 400 }
      );
    }
    if (sala !== "INT" && sala !== "PET") {
      return NextResponse.json({ error: "sala inválida" }, { status: 400 });
    }

    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("supervisores_tml")
      .insert({ nome, sala, telefone })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    );
  }
}
