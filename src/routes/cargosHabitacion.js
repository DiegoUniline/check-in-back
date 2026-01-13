const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// GET por reserva
router.get('/', async (req, res) => {
  try {
    const { reserva_id } = req.query;
    let sql = `
      SELECT ch.*, p.nombre as producto_nombre
      FROM cargos_habitacion ch
      LEFT JOIN productos p ON ch.producto_id = p.id
      WHERE 1=1
    `;
    const params = [];
    
    if (reserva_id) { sql += ' AND ch.reserva_id = ?'; params.push(reserva_id); }
    
    sql += ' ORDER BY ch.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST cargo
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const { reserva_id, producto_id, concepto, cantidad, precio_unitario, notas } = req.body;
    const id = uuidv4();
    
    const subtotal = cantidad * precio_unitario;
    const impuesto = subtotal * 0.16;
    const total = subtotal + impuesto;
    
    await conn.query(
      `INSERT INTO cargos_habitacion (id, reserva_id, producto_id, concepto, cantidad, precio_unitario, subtotal, impuesto, total, notas) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, reserva_id, producto_id, concepto, cantidad, precio_unitario, subtotal, impuesto, total, notas]
    );
    
    // Actualizar total de reserva
    await conn.query(
      `UPDATE reservas SET total = total + ?, saldo_pendiente = saldo_pendiente + ? WHERE id = ?`,
      [total, total, reserva_id]
    );
    
    // Si es producto físico, descontar stock
    if (producto_id) {
      const [prod] = await conn.query('SELECT stock_actual FROM productos WHERE id = ?', [producto_id]);
      if (prod.length && prod[0].stock_actual >= cantidad) {
        const stockAnterior = prod[0].stock_actual;
        const stockNuevo = stockAnterior - cantidad;
        
        await conn.query('UPDATE productos SET stock_actual = ? WHERE id = ?', [stockNuevo, producto_id]);
        
        await conn.query(
          `INSERT INTO movimientos_inventario (id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia) VALUES (?,?,'Venta',?,?,?,?)`,
          [uuidv4(), producto_id, cantidad, stockAnterior, stockNuevo, `Cargo habitación - Reserva ${reserva_id.slice(0,8)}`]
        );
      }
    }
    
    await conn.commit();
    res.status(201).json({ id, total_cargo: total });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// DELETE cargo
router.delete('/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    // Obtener cargo para revertir
    const [cargo] = await conn.query('SELECT * FROM cargos_habitacion WHERE id = ?', [req.params.id]);
    if (!cargo.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'No encontrado' });
    }
    
    // Revertir total de reserva
    await conn.query(
      `UPDATE reservas SET total = total - ?, saldo_pendiente = saldo_pendiente - ? WHERE id = ?`,
      [cargo[0].total, cargo[0].total, cargo[0].reserva_id]
    );
    
    // Eliminar cargo
    await conn.query('DELETE FROM cargos_habitacion WHERE id = ?', [req.params.id]);
    
    await conn.commit();
    res.json({ success: true });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
