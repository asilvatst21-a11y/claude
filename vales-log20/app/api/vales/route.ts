import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServiceClient();

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
        data_rota,
        status_vale,
        acao_transportadora,
        justificativa_transportadora,
        acao_primeiro_nivel,
        data_primeiro_nivel,
        usuario_primeiro_nivel,
        motivo_primeiro_nivel,
        justificativa_primeiro_nivel,
        valor_total,
        contestado,
        motivo_contestacao,
        contestado_em,
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
          unidade,
          qtde_diferenca,
          qtde_diferenca_avulsa,
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
