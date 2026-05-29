const express = require('express');
const router = express.Router();
const db = require('../db');

function deriveStatus(dto) {
  const today = new Date().toISOString().split('T')[0];
  if (dto.status === 'ausente') return 'ausente';
  if (dto.data_validade < today) return 'vencido';
  return 'em_dia';
}

function withDerivedStatus(dto) {
  return { ...dto, status: deriveStatus(dto) };
}

// GET / - list all
router.get('/', (req, res, next) => {
  try {
    const { colaborador_id, status, lider_id } = req.query;
    let sql = 'SELECT * FROM dtos WHERE 1=1';
    const params = [];
    if (colaborador_id) { sql += ' AND colaborador_id = ?'; params.push(colaborador_id); }
    if (lider_id) { sql += ' AND lider_id = ?'; params.push(lider_id); }
    sql += ' ORDER BY data_realizacao DESC';
    let rows = db.prepare(sql).all(...params).map(withDerivedStatus);
    if (status) rows = rows.filter(r => r.status === status);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /:id
router.get('/:id', (req, res, next) => {
  try {
    const dto = db.prepare('SELECT * FROM dtos WHERE id = ?').get(req.params.id);
    if (!dto) return res.status(404).json({ message: 'DTO não encontrado' });
    res.json(withDerivedStatus(dto));
  } catch (err) {
    next(err);
  }
});

// POST / - create
router.post('/', (req, res, next) => {
  try {
    const { colaborador_id, data_realizacao, data_validade, lider_id, observacoes } = req.body;
    if (!colaborador_id || !data_realizacao || !data_validade) {
      return res.status(400).json({ message: 'Campos obrigatórios faltando' });
    }
    const today = new Date().toISOString().split('T')[0];
    const status = data_validade < today ? 'vencido' : 'em_dia';
    const info = db.prepare(
      'INSERT INTO dtos (colaborador_id, data_realizacao, data_validade, status, lider_id, observacoes) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(colaborador_id, data_realizacao, data_validade, status, lider_id || null, observacoes || null);
    const created = db.prepare('SELECT * FROM dtos WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(withDerivedStatus(created));
  } catch (err) {
    next(err);
  }
});

// PUT /:id - update
router.put('/:id', (req, res, next) => {
  try {
    const dto = db.prepare('SELECT * FROM dtos WHERE id = ?').get(req.params.id);
    if (!dto) return res.status(404).json({ message: 'DTO não encontrado' });
    const { data_realizacao, data_validade, status, lider_id, observacoes } = req.body;
    const newValidade = data_validade ?? dto.data_validade;
    const today = new Date().toISOString().split('T')[0];
    let newStatus = status ?? dto.status;
    if (newStatus !== 'ausente') {
      newStatus = newValidade < today ? 'vencido' : 'em_dia';
    }
    db.prepare(
      'UPDATE dtos SET data_realizacao=?, data_validade=?, status=?, lider_id=?, observacoes=? WHERE id=?'
    ).run(
      data_realizacao ?? dto.data_realizacao,
      newValidade,
      newStatus,
      lider_id ?? dto.lider_id,
      observacoes ?? dto.observacoes,
      dto.id
    );
    const updated = db.prepare('SELECT * FROM dtos WHERE id = ?').get(dto.id);
    res.json(withDerivedStatus(updated));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
