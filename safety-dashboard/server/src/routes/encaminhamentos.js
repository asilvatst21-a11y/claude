const express = require('express');
const router = express.Router();
const db = require('../db');

// GET / - list all
router.get('/', (req, res, next) => {
  try {
    const { colaborador_id, tipo, status, lider_id } = req.query;
    let sql = `
      SELECT e.*, c.nome AS colaborador_nome, c.setor, c.cargo
      FROM encaminhamentos e
      JOIN colaboradores c ON c.id = e.colaborador_id
      WHERE 1=1
    `;
    const params = [];
    if (colaborador_id) { sql += ' AND e.colaborador_id = ?'; params.push(colaborador_id); }
    if (tipo) { sql += ' AND e.tipo = ?'; params.push(tipo); }
    if (status) { sql += ' AND e.status = ?'; params.push(status); }
    if (lider_id) { sql += ' AND e.lider_id = ?'; params.push(lider_id); }
    sql += ' ORDER BY e.criado_em DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    next(err);
  }
});

// GET /:id
router.get('/:id', (req, res, next) => {
  try {
    const row = db.prepare(`
      SELECT e.*, c.nome AS colaborador_nome, c.setor, c.cargo
      FROM encaminhamentos e
      JOIN colaboradores c ON c.id = e.colaborador_id
      WHERE e.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ message: 'Encaminhamento não encontrado' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// POST /
router.post('/', (req, res, next) => {
  try {
    const { colaborador_id, tipo, lider_id, prazo, status = 'pendente' } = req.body;
    if (!colaborador_id || !tipo || !prazo) {
      return res.status(400).json({ message: 'Campos obrigatórios faltando' });
    }
    const info = db.prepare(
      "INSERT INTO encaminhamentos (colaborador_id, tipo, lider_id, prazo, status, criado_em) VALUES (?, ?, ?, ?, ?, datetime('now'))"
    ).run(colaborador_id, tipo, lider_id || null, prazo, status);
    const created = db.prepare(`
      SELECT e.*, c.nome AS colaborador_nome, c.setor, c.cargo
      FROM encaminhamentos e
      JOIN colaboradores c ON c.id = e.colaborador_id
      WHERE e.id = ?
    `).get(info.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// PUT /:id - update status/prazo
router.put('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM encaminhamentos WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ message: 'Encaminhamento não encontrado' });
    const { status, prazo, tipo, lider_id } = req.body;
    db.prepare(
      'UPDATE encaminhamentos SET status=?, prazo=?, tipo=?, lider_id=? WHERE id=?'
    ).run(
      status ?? row.status,
      prazo ?? row.prazo,
      tipo ?? row.tipo,
      lider_id ?? row.lider_id,
      row.id
    );
    const updated = db.prepare(`
      SELECT e.*, c.nome AS colaborador_nome, c.setor, c.cargo
      FROM encaminhamentos e
      JOIN colaboradores c ON c.id = e.colaborador_id
      WHERE e.id = ?
    `).get(row.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
