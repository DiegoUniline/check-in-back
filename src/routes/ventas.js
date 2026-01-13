const express = require('express');
const router = express.Router();
const pool = require('../db');
const { v4: uuidv4 } = require('uuid');

// GET todas las ventas
router.get('/', async (req, res) => {
  try {
    const [ventas] = await pool.query(`
      SELECT * FROM ventas ORDER BY fecha DESC
    `);
    res.json(ventas);
  } catch (error) {
    console.error('Error al obtener ventas:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET venta por ID con detalle
router.get('/:id', async (req, res) => {
  try {
    const [ventas] = await pool.query('SELECT * FROM ventas WHERE id = ?', [req.params.id]);
    if (ventas.length === 0) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    const [detalle] = await pool.query('SELECT * FROM ventas_detalle WHERE venta_id = ?', [req.params.id]);
    res.json({ ...ventas[0], detalle });
  } catch (error) {
    console.error('Error al obtener venta:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST nueva venta con detalle
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { subtotal, iva, total, metodo_pago, detalle } = req.body;
    const ventaId = uuidv4();
    
    // Insertar venta (SIN habitacion_id ni reserva_id)
    await connection.query(
      `INSERT INTO ventas (id, subtotal, iva, total, metodo_pago, fecha) 
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [ventaId, subtotal || 0, iva || 0, total || 0, metodo_pago || 'efectivo']
    );
    
    // Insertar detalle si existe
    if (detalle && Array.isArray(detalle) && detalle.length > 0) {
      for (const item of detalle) {
        const detalleId = uuidv4();
        await connection.query(
          `INSERT INTO ventas_detalle (id, venta_id, producto_id, nombre, cantidad, precio_unitario, subtotal) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            detalleId,
            ventaId,
            item.producto_id || null,
            item.nombre || 'Producto',
            item.cantidad || 1,
            item.precio_unitario || 0,
            item.subtotal || item.total || 0
          ]
        );
      }
    }
    
    await connection.commit();
    res.status(201).json({ id: ventaId, message: 'Venta creada exitosamente' });
  } catch (error) {
    await connection.rollback();
    console.error('Error al crear venta:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

module.exports = router;
