const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// GET all con búsqueda
router.get('/', async (req, res) => {
  try {
    const { search, tipo, vip, nivel } = req.query;
    let sql = 'SELECT * FROM clientes WHERE activo = TRUE';
    const params = [];
    
    if (search) {
      sql += ' AND (nombre LIKE ? OR apellido_paterno LIKE ? OR email LIKE ? OR telefono LIKE ? OR numero_documento LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }
    if (tipo) { sql += ' AND tipo_cliente = ?'; params.push(tipo); }
    if (vip === 'true') { sql += ' AND es_vip = TRUE'; }
    if (nivel) { sql += ' AND nivel_lealtad = ?'; params.push(nivel); }
    
    sql += ' ORDER BY nombre, apellido_paterno LIMIT 100';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET one
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM clientes WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET historial de reservas
router.get('/:id/reservas', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM v_reservas_detalle WHERE cliente_id = ? ORDER BY fecha_checkin DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST
router.post('/', async (req, res) => {
  try {
    const { tipo_cliente, nombre, apellido_paterno, apellido_materno, razon_social, rfc, email, telefono, tipo_documento, numero_documento, nacionalidad, direccion, es_vip, notas } = req.body;
    const id = uuidv4();
    await pool.query(
      `INSERT INTO clientes (id, tipo_cliente, nombre, apellido_paterno, apellido_materno, razon_social, rfc, email, telefono, tipo_documento, numero_documento, nacionalidad, direccion, es_vip, notas) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, tipo_cliente || 'Persona', nombre, apellido_paterno, apellido_materno, razon_social, rfc, email, telefono, tipo_documento || 'INE', numero_documento, nacionalidad || 'Mexicana', direccion, es_vip || false, notas]
    );
    res.status(201).json({ id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT
router.put('/:id', async (req, res) => {
  try {
    const { tipo_cliente, nombre, apellido_paterno, apellido_materno, razon_social, rfc, email, telefono, tipo_documento, numero_documento, nacionalidad, direccion, es_vip, nivel_lealtad, notas } = req.body;
    await pool.query(
      `UPDATE clientes SET tipo_cliente=?, nombre=?, apellido_paterno=?, apellido_materno=?, razon_social=?, rfc=?, email=?, telefono=?, tipo_documento=?, numero_documento=?, nacionalidad=?, direccion=?, es_vip=?, nivel_lealtad=?, notas=? WHERE id=?`,
      [tipo_cliente, nombre, apellido_paterno, apellido_materno, razon_social, rfc, email, telefono, tipo_documento, numero_documento, nacionalidad, direccion, es_vip, nivel_lealtad, notas, req.params.id]
    );
    res.json({ id: req.params.id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE (soft)
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE clientes SET activo = FALSE WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
