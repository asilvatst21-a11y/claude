import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("vales")
      .select(
        `
        id,
        numero_vale,
        data_emissao,
        mapa,
        motorista,
        veiculo,
        status_vale,
        acao_transportadora,
        valor_total,
        notificacao_pendente_enviada,
        notificacao_final_enviada,
        importacao_id,
        created_at,
        updated_at,
        vale_ajudantes (
          posicao,
          ajudantes (
            id,
            codigo,
            nome,
            telefone
          )
        ),
        vale_itens (
          id,
          tipo_item,
          item,
          qtde_diferenca,
          valor,
          justificativa_ajudante,
          acao_transportadora
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform the nested structure
    const vales = (data ?? []).map((vale) => ({
      ...vale,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ajudantes: (vale.vale_ajudantes as any[])
        .sort((a, b) => a.posicao - b.posicao)
        .map((va) => va.ajudantes)
        .filter(Boolean),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      itens: vale.vale_itens as any[],
    }));

    return NextResponse.json(vales);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    );
  }
}
