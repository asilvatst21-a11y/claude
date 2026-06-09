import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseExcelBuffer } from "@/lib/excel-parser";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const summary = parseExcelBuffer(buffer);

    if (summary.totalVales === 0) {
      return NextResponse.json(
        { error: "Nenhum vale encontrado na planilha" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    // 1. Create importacao record
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
      throw new Error("Erro ao criar importação: " + importacaoError?.message);
    }

    // 2. Collect all unique ajudantes and upsert in batch
    const ajudantesMap = new Map<number, { codigo: number; nome: string }>();
    for (const vale of summary.vales) {
      for (const aj of vale.ajudantes) {
        if (!ajudantesMap.has(aj.codigo)) {
          ajudantesMap.set(aj.codigo, { codigo: aj.codigo, nome: aj.nome });
        }
      }
    }

    const ajudantesRows = Array.from(ajudantesMap.values());
    if (ajudantesRows.length > 0) {
      const { error: ajErr } = await supabase
        .from("ajudantes")
        .upsert(ajudantesRows, { onConflict: "codigo", ignoreDuplicates: false });
      if (ajErr) throw new Error("Erro ao salvar ajudantes: " + ajErr.message);
    }

    // Fetch all ajudante IDs
    const { data: ajudantesSaved, error: ajFetchErr } = await supabase
      .from("ajudantes")
      .select("id, codigo")
      .in("codigo", ajudantesRows.map((a) => a.codigo));
    if (ajFetchErr) throw new Error("Erro ao buscar ajudantes: " + ajFetchErr.message);

    const codigoToId = new Map<number, string>();
    for (const aj of ajudantesSaved ?? []) {
      codigoToId.set(aj.codigo, aj.id);
    }

    // 3. Upsert all vales in batch
    const valesRows = summary.vales.map((v) => ({
      numero_vale: v.numeroVale,
      data_emissao: v.dataEmissao,
      data_rota: v.dataRota,
      mapa: v.mapa,
      motorista: v.motorista,
      veiculo: v.veiculo,
      status_vale: v.statusVale,
      acao_transportadora: v.acaoTransportadora,
      justificativa_transportadora: v.justificativaTransportadora,
      acao_primeiro_nivel: v.acaoPrimeiroNivel,
      data_primeiro_nivel: v.dataPrimeiroNivel,
      usuario_primeiro_nivel: v.usuarioPrimeiroNivel,
      motivo_primeiro_nivel: v.motivoPrimeiroNivel,
      justificativa_primeiro_nivel: v.justificativaPrimeiroNivel,
      valor_total: v.valorTotal,
      importacao_id: importacao.id,
    }));

    const { error: valesErr } = await supabase
      .from("vales")
      .upsert(valesRows, { onConflict: "numero_vale", ignoreDuplicates: false });
    if (valesErr) throw new Error("Erro ao salvar vales: " + valesErr.message);

    // Fetch saved vale IDs
    const { data: valesSaved, error: valesFetchErr } = await supabase
      .from("vales")
      .select("id, numero_vale")
      .in("numero_vale", summary.vales.map((v) => v.numeroVale));
    if (valesFetchErr) throw new Error("Erro ao buscar vales: " + valesFetchErr.message);

    const numeroToValeId = new Map<number, string>();
    for (const v of valesSaved ?? []) {
      numeroToValeId.set(v.numero_vale, v.id);
    }

    // 4. Batch insert vale_itens (delete old first)
    const valeIds = Array.from(numeroToValeId.values());
    await supabase.from("vale_itens").delete().in("vale_id", valeIds);

    const itensRows = summary.vales.flatMap((v) => {
      const valeId = numeroToValeId.get(v.numeroVale);
      if (!valeId) return [];
      return v.itens.map((item) => ({
        vale_id: valeId,
        tipo_item: item.tipoItem,
        item: item.item,
        unidade: item.unidade,
        qtde_diferenca: item.qtdeDiferenca,
        qtde_diferenca_avulsa: item.qtdeDiferencaAvulsa,
        valor: item.valor,
        justificativa_ajudante: item.justificativaAjudante,
        acao_transportadora: item.acaoTransportadora,
      }));
    });

    if (itensRows.length > 0) {
      const { error: itensErr } = await supabase.from("vale_itens").insert(itensRows);
      if (itensErr) throw new Error("Erro ao salvar itens: " + itensErr.message);
    }

    // 5. Batch upsert vale_ajudantes
    const valeAjudantesRows = summary.vales.flatMap((v) => {
      const valeId = numeroToValeId.get(v.numeroVale);
      if (!valeId) return [];
      return v.ajudantes
        .map((aj) => {
          const ajId = codigoToId.get(aj.codigo);
          if (!ajId) return null;
          return { vale_id: valeId, ajudante_id: ajId, posicao: aj.posicao };
        })
        .filter((r): r is { vale_id: string; ajudante_id: string; posicao: number } => r !== null);
    });

    if (valeAjudantesRows.length > 0) {
      await supabase
        .from("vale_ajudantes")
        .upsert(valeAjudantesRows, { onConflict: "vale_id,ajudante_id", ignoreDuplicates: true });
    }

    // 6. Update importacao status
    await supabase
      .from("importacoes")
      .update({ status: "concluido", total_ajudantes_notificados: 0 })
      .eq("id", importacao.id);

    const datas = summary.vales
      .map((v) => v.dataEmissao)
      .filter((d): d is string => !!d)
      .sort();

    return NextResponse.json({
      success: true,
      totalLinhas: summary.totalLinhas,
      totalVales: summary.totalVales,
      valesNovos: summary.totalVales,
      ajudantesEncontrados: ajudantesRows.length,
      ajudantesNotificados: 0,
      dataMinima: datas[0] ?? null,
      dataMaxima: datas[datas.length - 1] ?? null,
      valesSemData: summary.vales.filter((v) => !v.dataEmissao).length,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno ao importar" },
      { status: 500 }
    );
  }
}
