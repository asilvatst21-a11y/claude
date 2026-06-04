import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
          codigo_item,
          item,
          unidade,
          qtde_saida,
          qtde_retorno,
          qtde_diferenca,
          valor,
          justificativa_ajudante,
          acao_transportadora
        )
      `
      )
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Vale não encontrado" }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const vale = {
      ...data,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ajudantes: (data.vale_ajudantes as any[])
        .sort((a, b) => a.posicao - b.posicao)
        .map((va) => va.ajudantes)
        .filter(Boolean),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      itens: data.vale_itens as any[],
    };

    return NextResponse.json(vale);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    );
  }
}
