import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseSaidaBuffer } from "@/lib/tml-parser";
import { atrasoMinutos, horarioLimite, isSalaTML } from "@/lib/tml";
import { sendMessage } from "@/lib/zapi";

async function gerarNumero(supabase: Awaited<ReturnType<typeof createServiceClient>>) {
  const { count } = await supabase.from("alertas_tml").select("*", { count: "exact", head: true });
  const n = ((count ?? 0) + 1).toString().padStart(4, "0");
  const d = new Date();
  const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `TML-${ds}-${n}`;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const saidas = parseSaidaBuffer(buffer);

    if (saidas.length === 0) {
      return NextResponse.json({ success: true, total: 0, alertasEnviados: 0 });
    }

    const supabase = await createServiceClient();

    const { error: upsertErr } = await supabase.from("saidas_tml").upsert(
      saidas.map((s) => ({
        mapa: s.mapa,
        placa: s.placa,
        matricula: s.matricula,
        data_saida: s.dataSaida,
        horario_saida: s.horarioSaida,
        importado_em: new Date().toISOString(),
      })),
      { onConflict: "mapa" }
    );
    if (upsertErr) throw new Error(upsertErr.message);

    const mapas = saidas.map((s) => s.mapa);

    const { data: escalas } = await supabase
      .from("escalas_tml")
      .select("mapa, sala, placa, matricula")
      .in("mapa", mapas);
    const escalaPorMapa = new Map((escalas ?? []).map((e) => [e.mapa, e]));

    const { data: alertasExistentes } = await supabase
      .from("alertas_tml")
      .select("mapa")
      .in("mapa", mapas);
    const mapasJaAlertados = new Set((alertasExistentes ?? []).map((a) => a.mapa));

    let alertasEnviados = 0;
    const erros: string[] = [];

    for (const saida of saidas) {
      if (mapasJaAlertados.has(saida.mapa) || !saida.horarioSaida) continue;

      const escala = escalaPorMapa.get(saida.mapa);
      if (!escala || !isSalaTML(escala.sala)) continue;

      const atraso = atrasoMinutos(escala.sala, saida.horarioSaida);
      if (atraso <= 0) continue;

      const { data: supervisores } = await supabase
        .from("supervisores_tml")
        .select("id, nome, telefone")
        .eq("sala", escala.sala);

      if (!supervisores?.length) {
        erros.push(`Mapa ${saida.mapa}: nenhum supervisor cadastrado para a sala ${escala.sala}`);
        continue;
      }

      const numero = await gerarNumero(supabase);
      const placa = saida.placa ?? escala.placa ?? "-";
      const matricula = saida.matricula ?? escala.matricula ?? null;
      const limite = horarioLimite(escala.sala);

      const mensagem =
        `⚠️ *TML PERDIDO — ${numero}*\n\n` +
        `🗺️ Mapa: ${saida.mapa}\n` +
        `🚛 Placa: ${placa}\n` +
        `👤 Motorista (matrícula): ${matricula ?? "—"}\n` +
        `🏢 Sala: ${escala.sala === "INT" ? "Interior" : "Petrópolis"}\n` +
        `🕐 Limite de saída: ${limite}\n` +
        `🕑 Saída real: ${saida.horarioSaida}\n` +
        `⏱️ Atraso: ${atraso} min\n\n` +
        `O motorista perdeu o TML. *Responda esta mensagem* com a justificativa.`;

      let zapiMessageId: string | undefined;
      for (const sup of supervisores) {
        const result = await sendMessage(sup.telefone, mensagem).catch(() => ({
          success: false,
          messageId: undefined,
          error: "Erro de rede",
        }));
        if (result.success && !zapiMessageId) zapiMessageId = result.messageId;
        if (!result.success) erros.push(`${sup.nome}: ${result.error}`);
      }

      await supabase.from("alertas_tml").insert({
        numero,
        mapa: saida.mapa,
        sala: escala.sala,
        placa,
        matricula,
        horario_limite: limite,
        horario_saida: saida.horarioSaida,
        atraso_minutos: atraso,
        supervisor_id: supervisores[0].id,
        mensagem_enviada: mensagem,
        zapi_message_id: zapiMessageId ?? null,
        status: "enviado",
      });

      alertasEnviados++;
    }

    return NextResponse.json({
      success: true,
      total: saidas.length,
      alertasEnviados,
      erros: erros.length ? erros : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno ao importar saída" },
      { status: 500 }
    );
  }
}
