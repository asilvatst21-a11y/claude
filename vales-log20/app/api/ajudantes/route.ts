import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServiceClient();

    // Get ajudantes with their pending vales count
    const { data: ajudantes, error } = await supabase
      .from("ajudantes")
      .select(
        `
        id,
        codigo,
        nome,
        telefone,
        created_at,
        updated_at,
        vale_ajudantes (
          vale_id,
          vales (
            id,
            status_vale
          )
        )
      `
      )
      .order("nome");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate vales per status per ajudante
    const ajudantesComVales = (ajudantes ?? []).map((aj) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const valeLinks = aj.vale_ajudantes as any[];

      const valesAbonados = valeLinks.filter((va) => va.vales?.status_vale === "Abonado").length;
      const valesFaturados = valeLinks.filter((va) => va.vales?.status_vale === "Faturado").length;
      const valesPendentes = valeLinks.filter((va) => {
        const status = va.vales?.status_vale;
        return status === "Sem Ação" || status === "Faturar";
      }).length;

      return {
        id: aj.id,
        codigo: aj.codigo,
        nome: aj.nome,
        telefone: aj.telefone,
        created_at: aj.created_at,
        updated_at: aj.updated_at,
        vales_pendentes: valesPendentes,
        vales_abonados: valesAbonados,
        vales_faturados: valesFaturados,
      };
    });

    return NextResponse.json(ajudantesComVales);
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
    const { codigo, nome, telefone } = body;

    if (!codigo || !nome) {
      return NextResponse.json(
        { error: "codigo e nome são obrigatórios" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from("ajudantes")
      .insert({ codigo, nome, telefone })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Ajudante com este código já existe" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    );
  }
}
