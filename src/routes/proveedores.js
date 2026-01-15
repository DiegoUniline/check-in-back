const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const checkSubscription = require('../middleware/checkSubscription');

router.use(checkSubscription);

// Helper para obtener cuenta_id del hotel
const getCuentaId = async (hotel_id) => {
  const [rows] = await pool.query('SELECT cuenta_id FROM hotel WHERE id = ?', [hotel_id]);
  return rows[0]?.cuenta_id;
};

// GET todos
router.get('/', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const [rows] = await pool.query('SELECT * FROM proveedores WHERE cuenta_id = ? AND activo = TRUE ORDER BY nombre', [cuenta_id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET uno
router.get('/:id', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const [rows] = await pool.query('SELECT * FROM proveedores WHERE id = ? AND cuenta_id = ?', [req.params.id, cuenta_id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST
router.post('/', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { nombre, rfc, contacto, telefono, email, direccion, notas } = req.body;
    const id = uuidv4();
    await pool.query(
      `INSERT INTO proveedores (id, cuenta_id, nombre, rfc, contacto, telefono, email, direccion, notas) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, cuenta_id, nombre, rfc, contacto, telefono, email, direccion, notas]
    );
    res.status(201).json({ id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT
router.put('/:id', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { nombre, rfc, contacto, telefono, email, direccion, notas } = req.body;
    await pool.query(
      `UPDATE proveedores SET nombre=?, rfc=?, contacto=?, telefono=?, email=?, direccion=?, notas=? WHERE id=? AND cuenta_id=?`,
      [nombre, rfc, contacto, telefono, email, direccion, notas, req.params.id, cuenta_id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE (soft)
router.delete('/:id', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    await pool.query('UPDATE proveedores SET activo = FALSE WHERE id = ? AND cuenta_id = ?', [req.params.id, cuenta_id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
