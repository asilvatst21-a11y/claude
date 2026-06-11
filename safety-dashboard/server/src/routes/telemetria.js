const express = require('express');
const router = express.Router();
const db = require('../db');

// GET / - list all
router.get('/', (req, res, next) => {
  try {
    const { motorista_id, periodo_ref } = req.query;
    let sql = 'SELECT * FROM telemetria WHERE 1=1';
    const params = [];
    if (motorista_id) { sql += ' AND motorista_id = ?'; params.push(motorista_id); }
    if (periodo_ref) { sql += ' AND periodo_ref = ?'; params.push(periodo_ref); }
    sql += ' ORDER BY periodo_ref DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    next(err);
  }
});

// GET /:id
router.get('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM telemetria WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ message: 'Registro de telemetria não encontrado' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// POST / - create + update score_calculado
router.post('/', (req, res, next) => {
  try {
    const { motorista_id, periodo_ref } = req.body;
    const qtd_excessos_velocidade = Number(req.body.qtd_excessos_velocidade ?? 0);
    const qtd_frenagens_bruscas = Number(req.body.qtd_frenagens_bruscas ?? 0);
    const qtd_curvas_bruscas = Number(req.body.qtd_curvas_bruscas ?? 0);
    if (!motorista_id || !periodo_ref) {
      return res.status(400).json({ message: 'Campos obrigatórios faltando' });
    }
    if (isNaN(qtd_excessos_velocidade) || isNaN(qtd_frenagens_bruscas) || isNaN(qtd_curvas_bruscas)) {
      return res.status(400).json({ message: 'Campos de quantidade devem ser números' });
    }

    const excess_penalty = Math.min(qtd_excessos_velocidade * 3, 40);
    const braking_penalty = Math.min(qtd_frenagens_bruscas * 2, 30);
    const curve_penalty = Math.min(qtd_curvas_bruscas * 2, 30);
    let raw = 100 - excess_penalty - braking_penalty - curve_penalty;
    raw = Math.max(0, Math.min(100, raw));
    if (qtd_excessos_velocidade > 10) raw = Math.min(raw, 30);
    const score_calculado = parseFloat((raw * 0.30).toFixed(2));

    const info = db.prepare(
      'INSERT INTO telemetria (motorista_id, periodo_ref, qtd_excessos_velocidade, qtd_frenagens_bruscas, qtd_curvas_bruscas, score_calculado) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(motorista_id, periodo_ref, qtd_excessos_velocidade, qtd_frenagens_bruscas, qtd_curvas_bruscas, score_calculado);

    const created = db.prepare('SELECT * FROM telemetria WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// PUT /:id
router.put('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM telemetria WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ message: 'Registro de telemetria não encontrado' });

    const qtd_excessos_velocidade = Number(req.body.qtd_excessos_velocidade ?? row.qtd_excessos_velocidade);
    const qtd_frenagens_bruscas = Number(req.body.qtd_frenagens_bruscas ?? row.qtd_frenagens_bruscas);
    const qtd_curvas_bruscas = Number(req.body.qtd_curvas_bruscas ?? row.qtd_curvas_bruscas);
    const periodo_ref = req.body.periodo_ref ?? row.periodo_ref;

    const excess_penalty = Math.min(qtd_excessos_velocidade * 3, 40);
    const braking_penalty = Math.min(qtd_frenagens_bruscas * 2, 30);
    const curve_penalty = Math.min(qtd_curvas_bruscas * 2, 30);
    let raw = 100 - excess_penalty - braking_penalty - curve_penalty;
    raw = Math.max(0, Math.min(100, raw));
    if (qtd_excessos_velocidade > 10) raw = Math.min(raw, 30);
    const score_calculado = parseFloat((raw * 0.30).toFixed(2));

    db.prepare(
      'UPDATE telemetria SET periodo_ref=?, qtd_excessos_velocidade=?, qtd_frenagens_bruscas=?, qtd_curvas_bruscas=?, score_calculado=? WHERE id=?'
    ).run(periodo_ref, qtd_excessos_velocidade, qtd_frenagens_bruscas, qtd_curvas_bruscas, score_calculado, row.id);

    const updated = db.prepare('SELECT * FROM telemetria WHERE id = ?').get(row.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
