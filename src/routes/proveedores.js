const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// GET todos
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM proveedores WHERE activo = TRUE ORDER BY nombre');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET uno
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM proveedores WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST
router.post('/', async (req, res) => {
  try {
    const { nombre, rfc, contacto, telefono, email, direccion, notas } = req.body;
    const id = uuidv4();
    await pool.query(
      `INSERT INTO proveedores (id, nombre, rfc, contacto, telefono, email, direccion, notas) VALUES (?,?,?,?,?,?,?,?)`,
      [id, nombre, rfc, contacto, telefono, email, direccion, notas]
    );
    res.status(201).json({ id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT
router.put('/:id', async (req, res) => {
  try {
    const { nombre, rfc, contacto, telefono, email, direccion, notas } = req.body;
    await pool.query(
      `UPDATE proveedores SET nombre=?, rfc=?, contacto=?, telefono=?, email=?, direccion=?, notas=? WHERE id=?`,
      [nombre, rfc, contacto, telefono, email, direccion, notas, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE (soft)
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE proveedores SET activo = FALSE WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
