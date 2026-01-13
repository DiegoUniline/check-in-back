const express = require('express');
const router = express.Router();
const pool = require('../db');

// Función simple para generar ID
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// GET todas las ventas
router.get('/', async (req, res) => {
  try {
    const [ventas] = await pool.query('SELECT * FROM ventas ORDER BY created_at DESC');
    res.json(ventas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST nueva venta
router.post('/', async (req, res) => {
  try {
    const { folio, subtotal, impuestos, total, metodo_pago, reserva_id, detalle } = req.body;
    const ventaId = generateId();
    
    await pool.query(
      'INSERT INTO ventas (id, folio, subtotal, impuestos, total, metodo_pago, reserva_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [ventaId, folio, subtotal || 0, impuestos || 0, total || 0, metodo_pago || 'Efectivo', reserva_id || null]
    );
    
    if (detalle && detalle.length > 0) {
      for (const item of detalle) {
        await pool.query(
          'INSERT INTO ventas_detalle (id, venta_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
          [generateId(), ventaId, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal]
        );
      }
    }
    
    res.status(201).json({ id: ventaId });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
