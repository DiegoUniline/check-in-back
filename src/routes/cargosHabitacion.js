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

// POST cargo
router.post('/', async (req, res) => {
  try {
    const { reserva_id, producto_id, concepto, cantidad, precio_unitario, subtotal, impuesto, total, notas } = req.body;
    const id = uuidv4();
    
    await pool.query(
      `INSERT INTO cargos_habitacion (id, reserva_id, producto_id, concepto, cantidad, precio_unitario, subtotal, impuesto, total, notas) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, reserva_id, producto_id || null, concepto || 'Cargo', cantidad || 1, precio_unitario || 0, subtotal || 0, impuesto || 0, total || 0, notas || null]
    );
    
    res.status(201).json({ id, ...req.body });
  } catch (error) {
    console.error('Error cargo:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
// POST cargo - SIN habitacion_id ya que la tabla no tiene esa columna
router.post('/', async (req, res) => {
  try {
    const { reserva_id, producto_id, concepto, cantidad, precio_unitario, subtotal, impuesto, total, notas } = req.body;
    const id = uuidv4();
    
    // Tu tabla tiene: id, reserva_id, producto_id, concepto, cantidad, precio_unitario, subtotal, impuesto, total, notas
    await pool.query(
      `INSERT INTO cargos_habitacion (id, reserva_id, producto_id, concepto, cantidad, precio_unitario, subtotal, impuesto, total, notas) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, reserva_id, producto_id || null, concepto || 'Cargo POS', cantidad || 1, precio_unitario || 0, subtotal || 0, impuesto || 0, total || 0, notas || null]
    );
    
    res.status(201).json({ id, ...req.body });
  } catch (error) {
    console.error('Error cargo:', error);
    res.status(500).json({ error: error.message });
  }
});

