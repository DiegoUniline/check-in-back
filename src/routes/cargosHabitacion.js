const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// GET por reserva
router.get('/reserva/:reserva_id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM cargos_habitacion WHERE reserva_id = ? ORDER BY created_at DESC`,
      [req.params.reserva_id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET por habitación
router.get('/habitacion/:habitacion_id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM cargos_habitacion WHERE habitacion_id = ? ORDER BY created_at DESC`,
      [req.params.habitacion_id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST cargo
router.post('/', async (req, res) => {
  try {
    const { habitacion_id, reserva_id, producto_id, producto_nombre, cantidad, precio_unitario, total } = req.body;
    const id = uuidv4();
    
    await pool.query(
      `INSERT INTO cargos_habitacion (id, habitacion_id, reserva_id, producto_id, producto_nombre, cantidad, precio_unitario, total) VALUES (?,?,?,?,?,?,?,?)`,
      [id, habitacion_id, reserva_id, producto_id, producto_nombre || 'Producto', cantidad || 1, precio_unitario || 0, total || (cantidad * precio_unitario)]
    );
    
    res.status(201).json({ id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
