const express = require('express');
const router = express.Router();
const pool = require('../db');
const { v4: uuidv4 } = require('uuid');

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
    const ventaId = uuidv4();
    
    await pool.query(
      `INSERT INTO ventas (id, folio, subtotal, impuestos, total, metodo_pago, reserva_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ventaId, folio, subtotal || 0, impuestos || 0, total || 0, metodo_pago || 'Efectivo', reserva_id || null]
    );
    
    // Insertar detalle
    if (detalle && detalle.length > 0) {
      for (const item of detalle) {
        await pool.query(
          'INSERT INTO ventas_detalle (id, venta_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
          [uuidv4(), ventaId, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal]
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
