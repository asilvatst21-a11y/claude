const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /
router.get('/', (req, res, next) => {
  try {
    const { colaborador_id, tipo, data_inicio, data_fim } = req.query;
    let sql = 'SELECT * FROM avaliacoes_conduta WHERE 1=1';
    const params = [];
    if (colaborador_id) { sql += ' AND colaborador_id = ?'; params.push(colaborador_id); }
    if (tipo) { sql += ' AND tipo = ?'; params.push(tipo); }
    if (data_inicio) { sql += ' AND data >= ?'; params.push(data_inicio); }
    if (data_fim) { sql += ' AND data <= ?'; params.push(data_fim); }
    sql += ' ORDER BY data DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    next(err);
  }
});

// GET /:id
router.get('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM avaliacoes_conduta WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ message: 'Avaliação não encontrada' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// POST /
router.post('/', (req, res, next) => {
  try {
    const { colaborador_id, data, tipo, descricao, gravidade, registrado_por } = req.body;
    if (!colaborador_id || !data || !tipo || !descricao || !gravidade || !registrado_por) {
      return res.status(400).json({ message: 'Campos obrigatórios faltando' });
    }
    const info = db.prepare(
      'INSERT INTO avaliacoes_conduta (colaborador_id, data, tipo, descricao, gravidade, registrado_por) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(colaborador_id, data, tipo, descricao, gravidade, registrado_por);
    const created = db.prepare('SELECT * FROM avaliacoes_conduta WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// PUT /:id
router.put('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM avaliacoes_conduta WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ message: 'Avaliação não encontrada' });
    const { data, tipo, descricao, gravidade, registrado_por } = req.body;
    db.prepare(
      'UPDATE avaliacoes_conduta SET data=?, tipo=?, descricao=?, gravidade=?, registrado_por=? WHERE id=?'
    ).run(
      data ?? row.data,
      tipo ?? row.tipo,
      descricao ?? row.descricao,
      gravidade ?? row.gravidade,
      registrado_por ?? row.registrado_por,
      row.id
    );
    const updated = db.prepare('SELECT * FROM avaliacoes_conduta WHERE id = ?').get(row.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /:id
router.delete('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM avaliacoes_conduta WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ message: 'Avaliação não encontrada' });
    db.prepare('DELETE FROM avaliacoes_conduta WHERE id = ?').run(row.id);
    res.json({ message: 'Avaliação removida com sucesso' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
