const express = require('express');
const router = express.Router();
const db = require('../db');
const { calculateScore } = require('../services/scoreService');

// GET /summary
router.get('/summary', (req, res, next) => {
  try {
    const totalColaboradores = db.prepare('SELECT COUNT(*) AS cnt FROM colaboradores').get().cnt;
    const totalAtivos = db.prepare("SELECT COUNT(*) AS cnt FROM colaboradores WHERE status='ativo'").get().cnt;

    const today = new Date().toISOString().split('T')[0];
    const allDtos = db.prepare('SELECT * FROM dtos').all();
    let dtosEmDia = 0;
    let dtosCriticos = 0;
    for (const dto of allDtos) {
      if (dto.status === 'ausente') continue;
      if (dto.data_validade < today) {
        const daysOverdue = Math.floor((new Date(today) - new Date(dto.data_validade)) / (1000 * 60 * 60 * 24));
        if (daysOverdue > 30) dtosCriticos++;
      } else {
        dtosEmDia++;
      }
    }

    const encaminhamentosPendentes = db.prepare("SELECT COUNT(*) AS cnt FROM encaminhamentos WHERE status='pendente'").get().cnt;

    const ativos = db.prepare("SELECT id FROM colaboradores WHERE status='ativo'").all();
    let scoreSum = 0;
    for (const col of ativos) {
      const { score } = calculateScore(col.id, db);
      scoreSum += score;
    }
    const scoreMedia = ativos.length > 0 ? Math.round(scoreSum / ativos.length) : 0;

    res.json({ totalColaboradores, totalAtivos, dtosEmDia, dtosCriticos, encaminhamentosPendentes, scoreMedia });
  } catch (err) {
    next(err);
  }
});

// GET /scores — ranked list; query: setor, lider_responsavel, risco (baixo|medio|alto|critico)
router.get('/scores', (req, res, next) => {
  try {
    const { setor, lider_responsavel, risco } = req.query;
    let sql = "SELECT * FROM colaboradores WHERE status='ativo'";
    const params = [];
    if (setor) { sql += ' AND setor = ?'; params.push(setor); }
    if (lider_responsavel) { sql += ' AND lider_responsavel = ?'; params.push(lider_responsavel); }
    sql += ' ORDER BY nome ASC';
    const colaboradores = db.prepare(sql).all(...params);

    let result = colaboradores.map(col => {
      const { score, riskLevel } = calculateScore(col.id, db);
      return { id: col.id, nome: col.nome, setor: col.setor, cargo: col.cargo, score, riskLevel };
    });

    if (risco) result = result.filter(r => r.riskLevel === risco);
    result.sort((a, b) => a.score - b.score);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /alerts
router.get('/alerts', (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const alerts = [];

    const allDtos = db.prepare(`
      SELECT d.*, c.nome AS colaborador_nome
      FROM dtos d JOIN colaboradores c ON c.id = d.colaborador_id
      WHERE d.status != 'ausente'
    `).all();
    for (const dto of allDtos) {
      if (dto.data_validade < today) {
        const daysOverdue = Math.floor((new Date(today) - new Date(dto.data_validade)) / (1000 * 60 * 60 * 24));
        if (daysOverdue > 30) {
          alerts.push({
            type: 'dto_critico',
            message: `DTO vencido há ${daysOverdue} dias`,
            colaborador_id: dto.colaborador_id,
            colaborador_nome: dto.colaborador_nome,
            severity: 'critico'
          });
        }
      }
    }

    const currentMonth = today.substring(0, 7);
    const telCrits = db.prepare(`
      SELECT t.*, c.nome AS colaborador_nome
      FROM telemetria t JOIN colaboradores c ON c.id = t.motorista_id
      WHERE t.periodo_ref = ? AND t.qtd_excessos_velocidade > 10
    `).all(currentMonth);
    for (const tel of telCrits) {
      alerts.push({
        type: 'telemetria_critica',
        message: `${tel.qtd_excessos_velocidade} excessos de velocidade em ${currentMonth}`,
        colaborador_id: tel.motorista_id,
        colaborador_nome: tel.colaborador_nome,
        severity: 'alto'
      });
    }

    // Score baixo: query DB for colaboradores with existing low-score encaminhamentos
    // (avoids score recalc side effects — auto-encaminhamentos were created at seed/write time)
    const scoreBaixo = db.prepare(`
      SELECT e.colaborador_id, c.nome AS colaborador_nome
      FROM encaminhamentos e
      JOIN colaboradores c ON c.id = e.colaborador_id
      WHERE e.tipo = 'encerramento_contrato' AND e.status = 'pendente'
    `).all();
    for (const row of scoreBaixo) {
      const { score } = calculateScore(row.colaborador_id, db);
      alerts.push({
        type: 'score_baixo',
        message: `Score ${score} — risco elevado`,
        colaborador_id: row.colaborador_id,
        colaborador_nome: row.colaborador_nome,
        severity: score < 25 ? 'critico' : 'alto'
      });
    }

    res.json(alerts);
  } catch (err) {
    next(err);
  }
});

// GET /score-history — monthly trend (last 6 months), computed from raw data
router.get('/score-history', (req, res, next) => {
  try {
    const today = new Date();
    const history = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const period = d.toISOString().substring(0, 7);
      const monthStart = period + '-01';
      const nextD = new Date(d);
      nextD.setMonth(nextD.getMonth() + 1);
      const monthEnd = nextD.toISOString().split('T')[0];

      // Conduta component: compute from that month's avaliacoes
      const avaliacoes = db.prepare(
        'SELECT tipo, gravidade FROM avaliacoes_conduta WHERE data >= ? AND data < ?'
      ).all(monthStart, monthEnd);
      let raw_conduta = 100;
      for (const a of avaliacoes) {
        if (a.tipo === 'ato_inseguro') raw_conduta -= a.gravidade * 4;
        if (a.tipo === 'condicao_insegura') raw_conduta -= a.gravidade * 2;
        if (a.tipo === 'abordagem_positiva') raw_conduta += a.gravidade * 3;
      }
      raw_conduta = Math.max(0, Math.min(100, raw_conduta));
      const condutaComponent = Math.round(raw_conduta * 0.40);

      // Telemetria component: recompute from raw fields for that period
      const telRows = db.prepare(
        'SELECT qtd_excessos_velocidade, qtd_frenagens_bruscas, qtd_curvas_bruscas FROM telemetria WHERE periodo_ref = ?'
      ).all(period);
      let telComponent = 30; // neutral when no data
      if (telRows.length > 0) {
        const rawScores = telRows.map(r => {
          const ep = Math.min(Number(r.qtd_excessos_velocidade) * 3, 40);
          const bp = Math.min(Number(r.qtd_frenagens_bruscas) * 2, 30);
          const cp = Math.min(Number(r.qtd_curvas_bruscas) * 2, 30);
          let raw = Math.max(0, Math.min(100, 100 - ep - bp - cp));
          if (Number(r.qtd_excessos_velocidade) > 10) raw = Math.min(raw, 30);
          return raw * 0.30;
        });
        telComponent = Math.round(rawScores.reduce((a, b) => a + b, 0) / rawScores.length);
      }

      // DTO component: neutral 21 (= 70% of max 30) as historical snapshot is unavailable
      const dtoComponent = 21;

      const avgScore = Math.min(100, dtoComponent + condutaComponent + telComponent);
      history.push({ period, score: avgScore });
    }

    res.json(history);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
