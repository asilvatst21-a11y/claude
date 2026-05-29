const express = require('express');
const router = express.Router();
const db = require('../db');
const { calculateScore } = require('../services/scoreService');

// GET / - list all
router.get('/', (req, res, next) => {
  try {
    const { setor, lider_responsavel, status, cargo } = req.query;
    let sql = 'SELECT * FROM colaboradores WHERE 1=1';
    const params = [];
    if (setor) { sql += ' AND setor = ?'; params.push(setor); }
    if (lider_responsavel) { sql += ' AND lider_responsavel = ?'; params.push(lider_responsavel); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (cargo) { sql += ' AND cargo = ?'; params.push(cargo); }
    sql += ' ORDER BY nome ASC';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /:id - get one with score
router.get('/:id', (req, res, next) => {
  try {
    const col = db.prepare('SELECT * FROM colaboradores WHERE id = ?').get(req.params.id);
    if (!col) return res.status(404).json({ message: 'Colaborador não encontrado' });
    const scoreData = calculateScore(col.id, db);
    res.json({ ...col, ...scoreData });
  } catch (err) {
    next(err);
  }
});

// POST / - create
router.post('/', (req, res, next) => {
  try {
    const { nome, cargo, setor, lider_responsavel, data_admissao, status = 'ativo' } = req.body;
    if (!nome || !cargo || !setor || !lider_responsavel || !data_admissao) {
      return res.status(400).json({ message: 'Campos obrigatórios faltando' });
    }
    const info = db.prepare(
      'INSERT INTO colaboradores (nome, cargo, setor, lider_responsavel, data_admissao, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(nome, cargo, setor, lider_responsavel, data_admissao, status);
    const created = db.prepare('SELECT * FROM colaboradores WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// PUT /:id - update
router.put('/:id', (req, res, next) => {
  try {
    const col = db.prepare('SELECT * FROM colaboradores WHERE id = ?').get(req.params.id);
    if (!col) return res.status(404).json({ message: 'Colaborador não encontrado' });
    const { nome, cargo, setor, lider_responsavel, data_admissao, status } = req.body;
    db.prepare(
      'UPDATE colaboradores SET nome=?, cargo=?, setor=?, lider_responsavel=?, data_admissao=?, status=? WHERE id=?'
    ).run(
      nome ?? col.nome,
      cargo ?? col.cargo,
      setor ?? col.setor,
      lider_responsavel ?? col.lider_responsavel,
      data_admissao ?? col.data_admissao,
      status ?? col.status,
      col.id
    );
    const updated = db.prepare('SELECT * FROM colaboradores WHERE id = ?').get(col.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /:id - soft delete
router.delete('/:id', (req, res, next) => {
  try {
    const col = db.prepare('SELECT * FROM colaboradores WHERE id = ?').get(req.params.id);
    if (!col) return res.status(404).json({ message: 'Colaborador não encontrado' });
    db.prepare("UPDATE colaboradores SET status='inativo' WHERE id=?").run(col.id);
    res.json({ message: 'Colaborador inativado com sucesso' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
