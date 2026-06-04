import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseExcelBuffer } from "@/lib/excel-parser";
import { sendValeNotificacao } from "@/lib/zapi";
import type { ValeParseado } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    // Parse the Excel file
    const buffer = await file.arrayBuffer();
    const summary = parseExcelBuffer(buffer);

    if (summary.totalVales === 0) {
      return NextResponse.json(
        { error: "Nenhum vale encontrado na planilha" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    // Create importacao record
    const { data: importacao, error: importacaoError } = await supabase
      .from("importacoes")
      .insert({
        nome_arquivo: file.name,
        total_linhas: summary.totalLinhas,
        total_vales: summary.totalVales,
        status: "processando",
      })
      .select()
      .single();

    if (importacaoError || !importacao) {
      throw new Error("Erro ao criar registro de importação: " + importacaoError?.message);
    }

    let valesNovos = 0;
    let ajudantesNotificados = 0;

    // Process each vale
    for (const valeData of summary.vales) {
      try {
        await processVale(supabase, valeData, importacao.id);

        // Check if this is a new vale
        const { data: existingVale } = await supabase
          .from("vales")
          .select("id, notificacao_pendente_enviada")
          .eq("numero_vale", valeData.numeroVale)
          .single();

        if (existingVale && !existingVale.notificacao_pendente_enviada) {
          valesNovos++;

          // Send WhatsApp notifications to ajudantes with phones
          const { data: ajudantesData } = await supabase
            .from("vale_ajudantes")
            .select("ajudantes(id, nome, telefone, codigo)")
            .eq("vale_id", existingVale.id);

          if (ajudantesData) {
            for (const va of ajudantesData) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const ajudante = (va as any).ajudantes;
              if (ajudante?.telefone) {
                const result = await sendValeNotificacao(ajudante, [
                  {
                    id: existingVale.id,
                    numero_vale: valeData.numeroVale,
                    status_vale: valeData.statusVale,
                  } as never,
                ]);

                // Record notification
                await supabase.from("notificacoes").insert({
                  vale_id: existingVale.id,
                  ajudante_id: ajudante.id,
                  tipo: "pendente",
                  telefone: ajudante.telefone,
                  mensagem: `Vale #${valeData.numeroVale} - notificação pendente`,
                  status: result.success ? "enviado" : "erro",
                  erro_detalhe: result.error ?? null,
                  enviada_em: result.success ? new Date().toISOString() : null,
                });

                if (result.success) {
                  ajudantesNotificados++;
                }
              }
            }

            // Mark as notified if at least one was sent
            if (ajudantesNotificados > 0) {
              await supabase
                .from("vales")
                .update({ notificacao_pendente_enviada: true })
                .eq("id", existingVale.id);
            }
          }
        }
      } catch (err) {
        console.error(`Error processing vale ${valeData.numeroVale}:`, err);
      }
    }

    // Update importacao record
    await supabase
      .from("importacoes")
      .update({
        status: "concluido",
        total_ajudantes_notificados: ajudantesNotificados,
      })
      .eq("id", importacao.id);

    return NextResponse.json({
      success: true,
      totalLinhas: summary.totalLinhas,
      totalVales: summary.totalVales,
      valesNovos,
      ajudantesEncontrados: summary.ajudantesEncontrados,
      ajudantesNotificados,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processVale(supabase: any, valeData: ValeParseado, importacaoId: string) {
  // Upsert ajudantes
  const ajudanteIds: { codigo: number; id: string }[] = [];

  for (const aj of valeData.ajudantes) {
    const { data: ajudante, error } = await supabase
      .from("ajudantes")
      .upsert(
        {
          codigo: aj.codigo,
          nome: aj.nome,
        },
        {
          onConflict: "codigo",
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (!error && ajudante) {
      ajudanteIds.push({ codigo: aj.codigo, id: ajudante.id });
    }
  }

  // Upsert vale
  const { data: vale, error: valeError } = await supabase
    .from("vales")
    .upsert(
      {
        numero_vale: valeData.numeroVale,
        data_emissao: valeData.dataEmissao,
        mapa: valeData.mapa,
        status_vale: valeData.statusVale,
        acao_transportadora: valeData.acaoTransportadora,
        valor_total: valeData.valorTotal,
        importacao_id: importacaoId,
      },
      {
        onConflict: "numero_vale",
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (valeError || !vale) {
    throw new Error("Erro ao upsert vale: " + valeError?.message);
  }

  // Delete old items and re-insert
  await supabase.from("vale_itens").delete().eq("vale_id", vale.id);

  // Insert vale items
  if (valeData.itens.length > 0) {
    await supabase.from("vale_itens").insert(
      valeData.itens.map((item) => ({
        vale_id: vale.id,
        tipo_item: item.tipoItem,
        item: item.item,
        qtde_diferenca: item.qtdeDiferenca,
        valor: item.valor,
        justificativa_ajudante: item.justificativaAjudante,
        acao_transportadora: item.acaoTransportadora,
      }))
    );
  }

  // Upsert vale_ajudantes relationships
  for (const aj of valeData.ajudantes) {
    const ajudanteId = ajudanteIds.find((a) => a.codigo === aj.codigo)?.id;
    if (ajudanteId) {
      await supabase
        .from("vale_ajudantes")
        .upsert(
          {
            vale_id: vale.id,
            ajudante_id: ajudanteId,
            posicao: aj.posicao,
          },
          {
            onConflict: "vale_id,ajudante_id",
            ignoreDuplicates: true,
          }
        );
    }
  }

  return vale;
}
