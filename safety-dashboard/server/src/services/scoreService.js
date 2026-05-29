function calculateScore(colaboradorId, db) {
  const today = new Date().toISOString().split('T')[0];
  let dtoCritical = false;
  let telemetriaCritical = false;

  // --- DTO Component (30%) ---
  const latestDto = db.prepare(
    'SELECT * FROM dtos WHERE colaborador_id = ? ORDER BY data_realizacao DESC LIMIT 1'
  ).get(colaboradorId);

  let raw_dto = 0;
  if (!latestDto) {
    raw_dto = 0;
  } else if (latestDto.status === 'ausente') {
    raw_dto = 0;
  } else if (latestDto.data_validade < today) {
    // vencido
    const validadeDate = new Date(latestDto.data_validade);
    const todayDate = new Date(today);
    const days_overdue = Math.floor((todayDate - validadeDate) / (1000 * 60 * 60 * 24));
    if (days_overdue > 30) {
      raw_dto = 0;
      dtoCritical = true;
    } else {
      raw_dto = 50;
    }
  } else {
    // em_dia
    raw_dto = 100;
  }
  const dto_component = raw_dto * 0.30;

  // --- Conduta Component (40%) ---
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const avaliacoes = db.prepare(
    'SELECT * FROM avaliacoes_conduta WHERE colaborador_id = ? AND data >= ?'
  ).all(colaboradorId, ninetyDaysAgo);

  let raw_conduta = 100;
  for (const avaliacao of avaliacoes) {
    if (avaliacao.tipo === 'ato_inseguro') raw_conduta -= avaliacao.gravidade * 4;
    if (avaliacao.tipo === 'condicao_insegura') raw_conduta -= avaliacao.gravidade * 2;
    if (avaliacao.tipo === 'abordagem_positiva') raw_conduta += avaliacao.gravidade * 3;
  }
  raw_conduta = Math.max(0, Math.min(100, raw_conduta));
  const conduta_component = raw_conduta * 0.40;

  // --- Telemetria Component (30%) ---
  const colaborador = db.prepare('SELECT cargo FROM colaboradores WHERE id = ?').get(colaboradorId);
  const isMotorista = colaborador && colaborador.cargo.toLowerCase() === 'motorista';

  let telemetria_component = 30;
  if (isMotorista) {
    const latest = db.prepare(
      'SELECT * FROM telemetria WHERE motorista_id = ? ORDER BY periodo_ref DESC LIMIT 1'
    ).get(colaboradorId);

    if (latest) {
      const excess_penalty = Math.min(latest.qtd_excessos_velocidade * 3, 40);
      const braking_penalty = Math.min(latest.qtd_frenagens_bruscas * 2, 30);
      const curve_penalty = Math.min(latest.qtd_curvas_bruscas * 2, 30);
      let raw_telemetria = 100 - excess_penalty - braking_penalty - curve_penalty;
      raw_telemetria = Math.max(0, Math.min(100, raw_telemetria));
      if (latest.qtd_excessos_velocidade > 10) {
        raw_telemetria = Math.min(raw_telemetria, 30);
        telemetriaCritical = true;
      }
      telemetria_component = raw_telemetria * 0.30;
    }
  }

  // --- Final Score ---
  const score = Math.round(dto_component + conduta_component + telemetria_component);
  const riskLevel =
    score >= 75 ? 'baixo' :
    score >= 50 ? 'medio' :
    score >= 25 ? 'alto' : 'critico';

  // --- Auto-encaminhamento (idempotent) ---
  if (score < 50) {
    const existing = db.prepare(
      "SELECT id FROM encaminhamentos WHERE colaborador_id = ? AND tipo = 'encerramento_contrato' AND status = 'pendente'"
    ).get(colaboradorId);
    if (!existing) {
      const prazo = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      db.prepare(
        "INSERT INTO encaminhamentos (colaborador_id, tipo, prazo, status, criado_em) VALUES (?, 'encerramento_contrato', ?, 'pendente', datetime('now'))"
      ).run(colaboradorId, prazo);
    }
  }

  return {
    score,
    riskLevel,
    components: {
      dto: Math.round(dto_component),
      conduta: Math.round(conduta_component),
      telemetria: Math.round(telemetria_component)
    },
    flags: { dtoCritical, telemetriaCritical }
  };
}

module.exports = { calculateScore };
