const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// GET todas
router.get('/', async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta, usuario_id } = req.query;
    let sql = `
      SELECT v.*, u.nombre as usuario_nombre
      FROM ventas v
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      WHERE 1=1
    `;
    const params = [];
    
    if (fecha_desde) { sql += ' AND DATE(v.created_at) >= ?'; params.push(fecha_desde); }
    if (fecha_hasta) { sql += ' AND DATE(v.created_at) <= ?'; params.push(fecha_hasta); }
    if (usuario_id) { sql += ' AND v.usuario_id = ?'; params.push(usuario_id); }
    
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
    const [venta] = await pool.query('SELECT * FROM ventas WHERE id = ?', [req.params.id]);
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

// POST venta
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const { usuario_id, cliente_id, reserva_id, subtotal, impuestos, total, metodo_pago, detalle } = req.body;
    const id = uuidv4();
    const folio = `V-${Date.now()}`;
    
    await conn.query(
      `INSERT INTO ventas (id, folio, usuario_id, cliente_id, reserva_id, subtotal, impuestos, total, metodo_pago) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, folio, usuario_id, cliente_id, reserva_id, subtotal, impuestos, total, metodo_pago || 'Efectivo']
    );
    
    if (detalle && detalle.length > 0) {
      for (const item of detalle) {
        await conn.query(
          `INSERT INTO ventas_detalle (id, venta_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?,?)`,
          [uuidv4(), id, item.producto_id, item.cantidad, item.precio_unitario, item.cantidad * item.precio_unitario]
        );
        
        // Descontar stock
        const [prod] = await conn.query('SELECT stock_actual FROM productos WHERE id = ?', [item.producto_id]);
        if (prod.length && prod[0].stock_actual >= item.cantidad) {
          const stockAnterior = prod[0].stock_actual;
          const stockNuevo = stockAnterior - item.cantidad;
          
          await conn.query('UPDATE productos SET stock_actual = ? WHERE id = ?', [stockNuevo, item.producto_id]);
          
          await conn.query(
            `INSERT INTO movimientos_inventario (id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia) VALUES (?,?,'Venta',?,?,?,?)`,
            [uuidv4(), item.producto_id, item.cantidad, stockAnterior, stockNuevo, `Venta ${folio}`]
          );
        }
      }
    }
    
    await conn.commit();
    res.status(201).json({ id, folio, ...req.body });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ventas_detalle WHERE venta_id = ?', [req.params.id]);
    await pool.query('DELETE FROM ventas WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
