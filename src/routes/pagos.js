const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Generar número de pago
const generarNumeroPago = async () => {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    "SELECT COUNT(*) as count FROM pagos WHERE numero_pago LIKE ?",
    [`PAG-${year}-%`]
  );
  const num = (rows[0].count + 1).toString().padStart(5, '0');
  return `PAG-${year}-${num}`;
};

// GET pagos de una reserva
router.get('/reserva/:reservaId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM pagos WHERE reserva_id = ? ORDER BY fecha DESC',
      [req.params.reservaId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all con filtros
router.get('/', async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta, metodo } = req.query;
    let sql = `
      SELECT p.*, r.numero_reserva, c.nombre as cliente_nombre, c.apellido_paterno
      FROM pagos p
      JOIN reservas r ON p.reserva_id = r.id
      JOIN clientes c ON r.cliente_id = c.id
      WHERE 1=1
    `;
    const params = [];
    
    if (fecha_desde) { sql += ' AND DATE(p.fecha) >= ?'; params.push(fecha_desde); }
    if (fecha_hasta) { sql += ' AND DATE(p.fecha) <= ?'; params.push(fecha_hasta); }
    if (metodo) { sql += ' AND p.metodo_pago = ?'; params.push(metodo); }
    
    sql += ' ORDER BY p.fecha DESC LIMIT 500';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST registrar pago
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const { reserva_id, monto, metodo_pago, referencia, tipo, notas } = req.body;
    
    // Verificar reserva
    const [reserva] = await conn.query('SELECT total, total_pagado, saldo_pendiente FROM reservas WHERE id = ?', [reserva_id]);
    if (!reserva.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }
    
    const id = uuidv4();
    const numero_pago = await generarNumeroPago();
    
    // Insertar pago
    await conn.query(
      `INSERT INTO pagos (id, reserva_id, numero_pago, monto, metodo_pago, referencia, tipo, notas) VALUES (?,?,?,?,?,?,?,?)`,
      [id, reserva_id, numero_pago, monto, metodo_pago, referencia, tipo || 'Abono', notas]
    );
    
    // Actualizar reserva
    const nuevoTotalPagado = parseFloat(reserva[0].total_pagado) + parseFloat(monto);
    const nuevoSaldo = parseFloat(reserva[0].total) - nuevoTotalPagado;
    
    await conn.query(
      `UPDATE reservas SET total_pagado = ?, saldo_pendiente = ? WHERE id = ?`,
      [nuevoTotalPagado, nuevoSaldo, reserva_id]
    );
    
    await conn.commit();
    res.status(201).json({ 
      id, 
      numero_pago, 
      total_pagado: nuevoTotalPagado, 
      saldo_pendiente: nuevoSaldo 
    });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// DELETE (reembolso)
router.delete('/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const [pago] = await conn.query('SELECT * FROM pagos WHERE id = ?', [req.params.id]);
    if (!pago.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Pago no encontrado' });
    }
    
    // Actualizar reserva
    const [reserva] = await conn.query('SELECT total_pagado, total FROM reservas WHERE id = ?', [pago[0].reserva_id]);
    const nuevoTotalPagado = parseFloat(reserva[0].total_pagado) - parseFloat(pago[0].monto);
    const nuevoSaldo = parseFloat(reserva[0].total) - nuevoTotalPagado;
    
    await conn.query(
      `UPDATE reservas SET total_pagado = ?, saldo_pendiente = ? WHERE id = ?`,
      [nuevoTotalPagado, nuevoSaldo, pago[0].reserva_id]
    );
    
    // Eliminar pago
    await conn.query('DELETE FROM pagos WHERE id = ?', [req.params.id]);
    
    await conn.commit();
    res.json({ success: true, total_pagado: nuevoTotalPagado, saldo_pendiente: nuevoSaldo });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
