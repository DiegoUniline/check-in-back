const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// GET todas
router.get('/', async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta, habitacion_id } = req.query;
    let sql = `SELECT v.*, h.numero as habitacion_numero FROM ventas v LEFT JOIN habitaciones h ON v.habitacion_id = h.id WHERE 1=1`;
    const params = [];
    
    if (fecha_desde) { sql += ' AND v.fecha >= ?'; params.push(fecha_desde); }
    if (fecha_hasta) { sql += ' AND v.fecha <= ?'; params.push(fecha_hasta); }
    if (habitacion_id) { sql += ' AND v.habitacion_id = ?'; params.push(habitacion_id); }
    
    sql += ' ORDER BY v.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET una con detalle
router.get('/:id', async (req, res) => {
  try {
    const [venta] = await pool.query(`SELECT * FROM ventas WHERE id = ?`, [req.params.id]);
    if (!venta.length) return res.status(404).json({ error: 'No encontrado' });
    
    const [detalle] = await pool.query(
      `SELECT vd.*, p.nombre as producto_nombre FROM ventas_detalle vd LEFT JOIN productos p ON vd.producto_id = p.id WHERE vd.venta_id = ?`,
      [req.params.id]
    );
    
    res.json({ ...venta[0], detalle });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST venta con detalle
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const { habitacion_id, reserva_id, subtotal, iva, total, metodo_pago, detalle } = req.body;
    const id = uuidv4();
    
    await conn.query(
      `INSERT INTO ventas (id, habitacion_id, reserva_id, subtotal, iva, total, metodo_pago, fecha) VALUES (?,?,?,?,?,?,?,NOW())`,
      [id, habitacion_id, reserva_id, subtotal, iva, total, metodo_pago]
    );
    
    // Insertar detalle
    const items = detalle || req.body.items || req.body.productos || [];
    if (items.length > 0) {
      for (const item of items) {
        await conn.query(
          `INSERT INTO ventas_detalle (id, venta_id, producto_id, nombre, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?,?,?)`,
          [uuidv4(), id, item.producto_id, item.nombre, item.cantidad, item.precio_unitario, item.subtotal || (item.cantidad * item.precio_unitario)]
        );
      }
    }
    
    await conn.commit();
    res.status(201).json({ id, ...req.body });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
