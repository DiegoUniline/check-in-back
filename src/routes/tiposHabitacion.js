const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// GET all
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tipos_habitacion WHERE activo = TRUE ORDER BY precio_base');
    const parsed = rows.map(r => ({ ...r, amenidades: JSON.parse(r.amenidades || '[]') }));
    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET one
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tipos_habitacion WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    rows[0].amenidades = JSON.parse(rows[0].amenidades || '[]');
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST
router.post('/', async (req, res) => {
  try {
    const { codigo, nombre, descripcion, capacidad_adultos, capacidad_ninos, capacidad_maxima, precio_base, precio_persona_extra, amenidades } = req.body;
    const id = uuidv4();
    await pool.query(
      `INSERT INTO tipos_habitacion (id, codigo, nombre, descripcion, capacidad_adultos, capacidad_ninos, capacidad_maxima, precio_base, precio_persona_extra, amenidades) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, codigo, nombre, descripcion, capacidad_adultos, capacidad_ninos, capacidad_maxima, precio_base, precio_persona_extra, JSON.stringify(amenidades || [])]
    );
    res.status(201).json({ id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT
router.put('/:id', async (req, res) => {
  try {
    const { codigo, nombre, descripcion, capacidad_adultos, capacidad_ninos, capacidad_maxima, precio_base, precio_persona_extra, amenidades } = req.body;
    await pool.query(
      `UPDATE tipos_habitacion SET codigo=?, nombre=?, descripcion=?, capacidad_adultos=?, capacidad_ninos=?, capacidad_maxima=?, precio_base=?, precio_persona_extra=?, amenidades=? WHERE id=?`,
      [codigo, nombre, descripcion, capacidad_adultos, capacidad_ninos, capacidad_maxima, precio_base, precio_persona_extra, JSON.stringify(amenidades || []), req.params.id]
    );
    res.json({ id: req.params.id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE (soft)
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE tipos_habitacion SET activo = FALSE WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
