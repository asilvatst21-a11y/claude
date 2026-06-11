const express = require('express');
const router = express.Router();
const db = require('../db');
const { calculateScore } = require('../services/scoreService');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const fs = require('fs');
const os = require('os');

// GET /csv — export CSV filtered by period (DTO date range), setor, lider, risco
router.get('/csv', async (req, res, next) => {
  let tmpFile = null;
  try {
    const { data_inicio, data_fim, setor, lider_responsavel, risco } = req.query;
    const today = new Date().toISOString().split('T')[0];

    let sql = "SELECT * FROM colaboradores WHERE status='ativo'";
    const params = [];
    if (setor) { sql += ' AND setor = ?'; params.push(setor); }
    if (lider_responsavel) { sql += ' AND lider_responsavel = ?'; params.push(lider_responsavel); }
    sql += ' ORDER BY nome ASC';
    const colaboradores = db.prepare(sql).all(...params);

    const rows = [];
    for (const col of colaboradores) {
      const { score, riskLevel } = calculateScore(col.id, db);

      if (risco && riskLevel !== risco) continue;

      const latestDto = db.prepare(
        'SELECT * FROM dtos WHERE colaborador_id = ? ORDER BY data_realizacao DESC LIMIT 1'
      ).get(col.id);

      // Period filter: check if colaborador has any DTO or avaliacao in the date range
      if (data_inicio || data_fim) {
        let inPeriod = false;
        if (latestDto) {
          const dr = latestDto.data_realizacao;
          if ((!data_inicio || dr >= data_inicio) && (!data_fim || dr <= data_fim)) inPeriod = true;
        }
        if (!inPeriod) {
          const countInPeriod = db.prepare(
            'SELECT COUNT(*) AS cnt FROM avaliacoes_conduta WHERE colaborador_id = ? AND data >= ? AND data <= ?'
          ).get(col.id, data_inicio || '1970-01-01', data_fim || today).cnt;
          if (countInPeriod > 0) inPeriod = true;
        }
        if (!inPeriod) continue;
      }

      let dto_status = 'sem_dto';
      let dto_validade = '';
      if (latestDto) {
        dto_validade = latestDto.data_validade;
        dto_status = latestDto.status === 'ausente' ? 'ausente' :
          latestDto.data_validade < today ? 'vencido' : 'em_dia';
      }

      const totalAvaliacoes = db.prepare(
        'SELECT COUNT(*) AS cnt FROM avaliacoes_conduta WHERE colaborador_id = ?'
      ).get(col.id).cnt;
      const encPendentes = db.prepare(
        "SELECT COUNT(*) AS cnt FROM encaminhamentos WHERE colaborador_id = ? AND status='pendente'"
      ).get(col.id).cnt;

      rows.push({
        id: col.id, nome: col.nome, cargo: col.cargo, setor: col.setor,
        lider_responsavel: col.lider_responsavel, score, risk_level: riskLevel,
        dto_status, dto_validade, total_avaliacoes: totalAvaliacoes,
        encaminhamentos_pendentes: encPendentes
      });
    }

    tmpFile = path.join(os.tmpdir(), `safety-report-${Date.now()}.csv`);
    const csvWriter = createObjectCsvWriter({
      path: tmpFile,
      header: [
        { id: 'id', title: 'ID' },
        { id: 'nome', title: 'Nome' },
        { id: 'cargo', title: 'Cargo' },
        { id: 'setor', title: 'Setor' },
        { id: 'lider_responsavel', title: 'Líder Responsável' },
        { id: 'score', title: 'Score' },
        { id: 'risk_level', title: 'Nível de Risco' },
        { id: 'dto_status', title: 'Status DTO' },
        { id: 'dto_validade', title: 'Validade DTO' },
        { id: 'total_avaliacoes', title: 'Total Avaliações' },
        { id: 'encaminhamentos_pendentes', title: 'Encaminhamentos Pendentes' }
      ]
    });

    await csvWriter.writeRecords(rows);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="safety-report-${today}.csv"`);

    const stream = fs.createReadStream(tmpFile);
    stream.on('error', (err) => {
      if (tmpFile) fs.unlink(tmpFile, () => {});
      next(err);
    });
    res.on('close', () => {
      if (tmpFile) fs.unlink(tmpFile, () => {});
    });
    stream.pipe(res);
  } catch (err) {
    if (tmpFile) fs.unlink(tmpFile, () => {});
    next(err);
  }
});

module.exports = router;
