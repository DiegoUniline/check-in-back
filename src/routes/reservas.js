const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Generar número de reserva
const generarNumeroReserva = async () => {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    "SELECT COUNT(*) as count FROM reservas WHERE numero_reserva LIKE ?",
    [`RES-${year}-%`]
  );
  const num = (rows[0].count + 1).toString().padStart(4, '0');
  return `RES-${year}-${num}`;
};

// GET all con filtros
router.get('/', async (req, res) => {
  try {
    const { estado, fecha_desde, fecha_hasta, cliente_id, habitacion_id } = req.query;
    let sql = 'SELECT * FROM v_reservas_detalle WHERE 1=1';
    const params = [];
    
    if (estado) { sql += ' AND estado = ?'; params.push(estado); }
    if (fecha_desde) { sql += ' AND fecha_checkin >= ?'; params.push(fecha_desde); }
    if (fecha_hasta) { sql += ' AND fecha_checkin <= ?'; params.push(fecha_hasta); }
    if (cliente_id) { sql += ' AND cliente_id = ?'; params.push(cliente_id); }
    if (habitacion_id) { sql += ' AND habitacion_id = ?'; params.push(habitacion_id); }
    
    sql += ' ORDER BY fecha_checkin DESC LIMIT 500';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET checkins del día
router.get('/checkins-hoy', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM v_reservas_detalle WHERE DATE(fecha_checkin) = CURDATE() AND estado IN ('Pendiente', 'Confirmada') ORDER BY hora_llegada`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET checkouts del día
router.get('/checkouts-hoy', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM v_reservas_detalle WHERE DATE(fecha_checkout) = CURDATE() AND estado = 'CheckIn' ORDER BY fecha_checkout`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET one - CORREGIDO: ORDER BY created_at en lugar de fecha
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v_reservas_detalle WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    
    // Traer pagos
    const [pagos] = await pool.query(
      'SELECT * FROM pagos WHERE reserva_id = ? ORDER BY created_at DESC', 
      [req.params.id]
    );
    
    // Traer cargos
    const [cargos] = await pool.query(
      'SELECT ch.*, p.nombre as producto_nombre FROM cargos_habitacion ch LEFT JOIN productos p ON ch.producto_id = p.id WHERE ch.reserva_id = ? ORDER BY ch.created_at DESC', 
      [req.params.id]
    );
    
    res.json({ ...rows[0], pagos, cargos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear reserva
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const { cliente_id, habitacion_id, tipo_habitacion_id, fecha_checkin, fecha_checkout, hora_llegada, adultos, ninos, tarifa_noche, solicitudes_especiales, notas_internas } = req.body;
    
    const id = uuidv4();
    const numero_reserva = await generarNumeroReserva();
    
    // Calcular noches y totales
    const checkin = new Date(fecha_checkin);
    const checkout = new Date(fecha_checkout);
    const noches = Math.ceil((checkout - checkin) / (1000 * 60 * 60 * 24));
    const subtotal = tarifa_noche * noches;
    const impuestos = subtotal * 0.16;
    const total = subtotal + impuestos;
    
    await conn.query(
      `INSERT INTO reservas (id, numero_reserva, cliente_id, habitacion_id, tipo_habitacion_id, fecha_checkin, fecha_checkout, hora_llegada, adultos, ninos, noches, tarifa_noche, subtotal_hospedaje, total_impuestos, total, total_pagado, saldo_pendiente, estado, solicitudes_especiales, notas_internas)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)`,
      [id, numero_reserva, cliente_id, habitacion_id, tipo_habitacion_id, fecha_checkin, fecha_checkout, hora_llegada, adultos || 1, ninos || 0, noches, tarifa_noche, subtotal, impuestos, total, total, 'Pendiente', solicitudes_especiales, notas_internas]
    );
    
    // Si tiene habitación asignada, marcarla como reservada
    if (habitacion_id) {
      await conn.query("UPDATE habitaciones SET estado_habitacion = 'Reservada' WHERE id = ?", [habitacion_id]);
    }
    
    await conn.commit();
    res.status(201).json({ id, numero_reserva, total, noches });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// PUT actualizar reserva
router.put('/:id', async (req, res) => {
  try {
    const { habitacion_id, tipo_habitacion_id, fecha_checkin, fecha_checkout, hora_llegada, adultos, ninos, tarifa_noche, solicitudes_especiales, notas_internas } = req.body;
    
    const checkin = new Date(fecha_checkin);
    const checkout = new Date(fecha_checkout);
    const noches = Math.ceil((checkout - checkin) / (1000 * 60 * 60 * 24));
    const subtotal = tarifa_noche * noches;
    const impuestos = subtotal * 0.16;
    const total = subtotal + impuestos;
    
    // Get current paid
    const [current] = await pool.query('SELECT total_pagado FROM reservas WHERE id = ?', [req.params.id]);
    const saldo = total - (current[0]?.total_pagado || 0);
    
    await pool.query(
      `UPDATE reservas SET habitacion_id=?, tipo_habitacion_id=?, fecha_checkin=?, fecha_checkout=?, hora_llegada=?, adultos=?, ninos=?, noches=?, tarifa_noche=?, subtotal_hospedaje=?, total_impuestos=?, total=?, saldo_pendiente=?, solicitudes_especiales=?, notas_internas=? WHERE id=?`,
      [habitacion_id, tipo_habitacion_id, fecha_checkin, fecha_checkout, hora_llegada, adultos, ninos, noches, tarifa_noche, subtotal, impuestos, total, saldo, solicitudes_especiales, notas_internas, req.params.id]
    );
    res.json({ id: req.params.id, total, noches, saldo_pendiente: saldo });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Check-In
router.post('/:id/checkin', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const { habitacion_id } = req.body;
    const [reserva] = await conn.query('SELECT * FROM reservas WHERE id = ?', [req.params.id]);
    
    if (!reserva.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }
    
    const habId = habitacion_id || reserva[0].habitacion_id;
    if (!habId) {
      await conn.rollback();
      return res.status(400).json({ error: 'Debe asignar una habitación' });
    }
    
    // Actualizar reserva
    await conn.query(
      `UPDATE reservas SET estado = 'CheckIn', checkin_realizado = TRUE, fecha_checkin_real = NOW(), habitacion_id = ? WHERE id = ?`,
      [habId, req.params.id]
    );
    
    // Actualizar habitación
    await conn.query(
      `UPDATE habitaciones SET estado_habitacion = 'Ocupada' WHERE id = ?`,
      [habId]
    );
    
    // Incrementar estancias del cliente
    await conn.query(
      `UPDATE clientes SET total_estancias = total_estancias + 1 WHERE id = ?`,
      [reserva[0].cliente_id]
    );
    
    await conn.commit();
    res.json({ success: true, message: 'Check-in realizado' });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// POST Check-Out
router.post('/:id/checkout', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const [reserva] = await conn.query('SELECT * FROM reservas WHERE id = ?', [req.params.id]);
    
    if (!reserva.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }
    
    if (reserva[0].saldo_pendiente > 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'Tiene saldo pendiente', saldo: reserva[0].saldo_pendiente });
    }
    
    // Actualizar reserva
    await conn.query(
      `UPDATE reservas SET estado = 'CheckOut', checkout_realizado = TRUE, fecha_checkout_real = NOW() WHERE id = ?`,
      [req.params.id]
    );
    
    // Actualizar habitación
    await conn.query(
      `UPDATE habitaciones SET estado_habitacion = 'Disponible', estado_limpieza = 'Sucia' WHERE id = ?`,
      [reserva[0].habitacion_id]
    );
    
    // Crear tarea de limpieza
    await conn.query(
      `INSERT INTO tareas_limpieza (id, habitacion_id, fecha, tipo, prioridad, estado) VALUES (?, ?, CURDATE(), 'Checkout', 'Alta', 'Pendiente')`,
      [uuidv4(), reserva[0].habitacion_id]
    );
    
    await conn.commit();
    res.json({ success: true, message: 'Check-out realizado' });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// POST Cancelar
router.post('/:id/cancelar', async (req, res) => {
  try {
    const { motivo } = req.body;
    const [reserva] = await pool.query('SELECT habitacion_id FROM reservas WHERE id = ?', [req.params.id]);
    
    await pool.query(
      `UPDATE reservas SET estado = 'Cancelada', notas_internas = CONCAT(IFNULL(notas_internas,''), '\nCancelada: ', ?) WHERE id = ?`,
      [motivo || 'Sin motivo', req.params.id]
    );
    
    if (reserva[0]?.habitacion_id) {
      await pool.query(`UPDATE habitaciones SET estado_habitacion = 'Disponible' WHERE id = ?`, [reserva[0].habitacion_id]);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH confirmar
router.patch('/:id/confirmar', async (req, res) => {
  try {
    await pool.query(`UPDATE reservas SET estado = 'Confirmada' WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
