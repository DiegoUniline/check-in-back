const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const checkSubscription = require('../middleware/checkSubscription');

router.use(checkSubscription);

// Generar número de pago
const generarNumeroPago = async (hotel_id) => {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    "SELECT COUNT(*) as count FROM pagos WHERE hotel_id = ? AND numero_pago LIKE ?",
    [hotel_id, `PAG-${year}-%`]
  );
  const num = (rows[0].count + 1).toString().padStart(5, '0');
  return `PAG-${year}-${num}`;
};

// GET pagos de una reserva
router.get('/reserva/:reservaId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.* FROM pagos p
       JOIN reservas r ON p.reserva_id = r.id
       WHERE p.reserva_id = ? AND r.hotel_id = ?
       ORDER BY p.fecha DESC`,
      [req.params.reservaId, req.hotel_id]
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
      WHERE p.hotel_id = ?
    `;
    const params = [req.hotel_id];
    
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
    
    const [reserva] = await conn.query('SELECT total, total_pagado, saldo_pendiente FROM reservas WHERE id = ? AND hotel_id = ?', [reserva_id, req.hotel_id]);
    if (!reserva.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }
    
    const id = uuidv4();
    const numero_pago = await generarNumeroPago(req.hotel_id);
    
    await conn.query(
      `INSERT INTO pagos (id, hotel_id, reserva_id, numero_pago, monto, metodo_pago, referencia, tipo, notas) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, req.hotel_id, reserva_id, numero_pago, monto, metodo_pago, referencia, tipo || 'Abono', notas]
    );
    
    const nuevoTotalPagado = parseFloat(reserva[0].total_pagado) + parseFloat(monto);
    const nuevoSaldo = parseFloat(reserva[0].total) - nuevoTotalPagado;
    
    await conn.query(
      `UPDATE reservas SET total_pagado = ?, saldo_pendiente = ? WHERE id = ? AND hotel_id = ?`,
      [nuevoTotalPagado, nuevoSaldo, reserva_id, req.hotel_id]
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
    
    const [pago] = await conn.query('SELECT * FROM pagos WHERE id = ? AND hotel_id = ?', [req.params.id, req.hotel_id]);
    if (!pago.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Pago no encontrado' });
    }
    
    const [reserva] = await conn.query('SELECT total_pagado, total FROM reservas WHERE id = ? AND hotel_id = ?', [pago[0].reserva_id, req.hotel_id]);
    const nuevoTotalPagado = parseFloat(reserva[0].total_pagado) - parseFloat(pago[0].monto);
    const nuevoSaldo = parseFloat(reserva[0].total) - nuevoTotalPagado;
    
    await conn.query(
      `UPDATE reservas SET total_pagado = ?, saldo_pendiente = ? WHERE id = ? AND hotel_id = ?`,
      [nuevoTotalPagado, nuevoSaldo, pago[0].reserva_id, req.hotel_id]
    );
    
    await conn.query('DELETE FROM pagos WHERE id = ? AND hotel_id = ?', [req.params.id, req.hotel_id]);
    
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
