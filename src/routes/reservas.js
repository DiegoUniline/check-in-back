const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const checkSubscription = require('../middleware/checkSubscription');

// Middleware de protección SaaS
router.use(checkSubscription);

// Generar número de reserva
const generarNumeroReserva = async (hotel_id) => {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    "SELECT COUNT(*) as count FROM reservas WHERE hotel_id = ? AND numero_reserva LIKE ?",
    [hotel_id, `RES-${year}-%`]
  );
  const num = (rows[0].count + 1).toString().padStart(4, '0');
  return `RES-${year}-${num}`;
};

// GET all con filtros
router.get('/', async (req, res) => {
  try {
    const { estado, fecha_desde, fecha_hasta, cliente_id, habitacion_id } = req.query;
    let sql = 'SELECT * FROM v_reservas_detalle WHERE hotel_id = ?';
    const params = [req.hotel_id];
    
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
      `SELECT * FROM v_reservas_detalle WHERE hotel_id = ? AND DATE(fecha_checkin) = CURDATE() AND estado IN ('Pendiente', 'Confirmada') ORDER BY hora_llegada`,
      [req.hotel_id]
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
      `SELECT * FROM v_reservas_detalle WHERE hotel_id = ? AND DATE(fecha_checkout) = CURDATE() AND estado = 'CheckIn' ORDER BY fecha_checkout`,
      [req.hotel_id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET one
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v_reservas_detalle WHERE id = ? AND hotel_id = ?', [req.params.id, req.hotel_id]);
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
    
    const { 
      cliente_id, habitacion_id, tipo_habitacion_id, fecha_checkin, fecha_checkout, 
      hora_llegada, adultos, ninos, personas_extra, cargo_persona_extra,
      tarifa_noche, solicitudes_especiales, notas_internas, origen,
      descuento_tipo, descuento_valor
    } = req.body;
    
    const id = uuidv4();
    const numero_reserva = await generarNumeroReserva(req.hotel_id);
    
    // Calcular noches y totales (Lógica idéntica a la tuya)
    const checkin = new Date(fecha_checkin);
    const checkout = new Date(fecha_checkout);
    const noches = Math.ceil((checkout - checkin) / (1000 * 60 * 60 * 24)) || 1;
    
    const subtotalHospedaje = tarifa_noche * noches;
    const totalPersonaExtra = (personas_extra || 0) * (cargo_persona_extra || 0) * noches;
    const subtotal = subtotalHospedaje + totalPersonaExtra;
    
    let descuentoMonto = 0;
    if (descuento_tipo === 'Monto') {
      descuentoMonto = descuento_valor || 0;
    } else if (descuento_tipo === 'Porcentaje') {
      descuentoMonto = subtotal * ((descuento_valor || 0) / 100);
    }
    
    const subtotalConDescuento = subtotal - descuentoMonto;
    const impuestos = subtotalConDescuento * 0.16;
    const total = subtotalConDescuento + impuestos;
    
    await conn.query(
      `INSERT INTO reservas (
        id, hotel_id, numero_reserva, cliente_id, habitacion_id, tipo_habitacion_id, 
        fecha_checkin, fecha_checkout, hora_llegada, adultos, ninos, personas_extra, cargo_persona_extra,
        noches, tarifa_noche, subtotal_hospedaje, 
        descuento_tipo, descuento_valor, descuento_monto,
        total_impuestos, total, total_pagado, saldo_pendiente, 
        estado, origen, solicitudes_especiales, notas_internas
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`,
      [
        id, req.hotel_id, numero_reserva, cliente_id, habitacion_id, tipo_habitacion_id,
        fecha_checkin, fecha_checkout, hora_llegada, adultos || 1, ninos || 0, personas_extra || 0, cargo_persona_extra || 0,
        noches, tarifa_noche, subtotalHospedaje,
        descuento_tipo || null, descuento_valor || 0, descuentoMonto,
        impuestos, total, total,
        'Pendiente', origen || 'Reserva', solicitudes_especiales, notas_internas
      ]
    );
    
    if (habitacion_id) {
      await conn.query("UPDATE habitaciones SET estado_habitacion = 'Reservada' WHERE id = ? AND hotel_id = ?", [habitacion_id, req.hotel_id]);
    }
    
    await conn.commit();
    res.status(201).json({ id, numero_reserva, total, noches, descuento: descuentoMonto });
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
    const [current] = await pool.query('SELECT * FROM reservas WHERE id = ? AND hotel_id = ?', [req.params.id, req.hotel_id]);
    if (!current.length) return res.status(404).json({ error: 'Reserva no encontrada' });
    
    const reserva = current[0];
    
    const habitacion_id = req.body.habitacion_id ?? reserva.habitacion_id;
    const tipo_habitacion_id = req.body.tipo_habitacion_id ?? reserva.tipo_habitacion_id;
    const fecha_checkin = req.body.fecha_checkin ?? reserva.fecha_checkin;
    const fecha_checkout = req.body.fecha_checkout ?? reserva.fecha_checkout;
    const hora_llegada = req.body.hora_llegada ?? reserva.hora_llegada;
    const adultos = req.body.adultos ?? reserva.adultos;
    const ninos = req.body.ninos ?? reserva.ninos;
    const tarifa_noche = req.body.tarifa_noche ?? reserva.tarifa_noche;
    const solicitudes_especiales = req.body.solicitudes_especiales ?? reserva.solicitudes_especiales;
    const notas_internas = req.body.notas_internas ?? reserva.notas_internas;
    const estado = req.body.estado ?? reserva.estado;
    
    const checkin = new Date(fecha_checkin);
    const checkout = new Date(fecha_checkout);
    const noches = Math.ceil((checkout - checkin) / (1000 * 60 * 60 * 24)) || 1;
    const subtotal = (parseFloat(tarifa_noche) || 0) * noches;
    const impuestos = subtotal * 0.16;
    const total = subtotal + impuestos;
    const saldo = total - (parseFloat(reserva.total_pagado) || 0);
    
    await pool.query(
      `UPDATE reservas SET 
        habitacion_id=?, tipo_habitacion_id=?, fecha_checkin=?, fecha_checkout=?, 
        hora_llegada=?, adultos=?, ninos=?, noches=?, tarifa_noche=?, 
        subtotal_hospedaje=?, total_impuestos=?, total=?, saldo_pendiente=?, 
        solicitudes_especiales=?, notas_internas=?, estado=?
      WHERE id=? AND hotel_id=?`,
      [
        habitacion_id, tipo_habitacion_id, fecha_checkin, fecha_checkout,
        hora_llegada, adultos, ninos, noches, tarifa_noche,
        subtotal, impuestos, total, saldo,
        solicitudes_especiales, notas_internas, estado,
        req.params.id, req.hotel_id
      ]
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
    const [reserva] = await conn.query('SELECT * FROM reservas WHERE id = ? AND hotel_id = ?', [req.params.id, req.hotel_id]);
    
    if (!reserva.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }
    
    const habId = habitacion_id || reserva[0].habitacion_id;
    if (!habId) {
      await conn.rollback();
      return res.status(400).json({ error: 'Debe asignar una habitación' });
    }
    
    await conn.query(
      `UPDATE reservas SET estado = 'CheckIn', checkin_realizado = TRUE, fecha_checkin_real = NOW(), habitacion_id = ? WHERE id = ? AND hotel_id = ?`,
      [habId, req.params.id, req.hotel_id]
    );
    
    await conn.query(`UPDATE habitaciones SET estado_habitacion = 'Ocupada' WHERE id = ? AND hotel_id = ?`, [habId, req.hotel_id]);
    
    await conn.query(`UPDATE clientes SET total_estancias = total_estancias + 1 WHERE id = ? AND hotel_id = ?`, [reserva[0].cliente_id, req.hotel_id]);
    
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
    const [reserva] = await conn.query('SELECT * FROM reservas WHERE id = ? AND hotel_id = ?', [req.params.id, req.hotel_id]);
    
    if (!reserva.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }
    
    if (reserva[0].saldo_pendiente > 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'Tiene saldo pendiente', saldo: reserva[0].saldo_pendiente });
    }
    
    await conn.query(`UPDATE reservas SET estado = 'CheckOut', checkout_realizado = TRUE, fecha_checkout_real = NOW() WHERE id = ? AND hotel_id = ?`, [req.params.id, req.hotel_id]);
    
    await conn.query(`UPDATE habitaciones SET estado_habitacion = 'Disponible', estado_limpieza = 'Sucia' WHERE id = ? AND hotel_id = ?`, [reserva[0].habitacion_id, req.hotel_id]);
    
    await conn.query(
      `INSERT INTO tareas_limpieza (id, hotel_id, habitacion_id, fecha, tipo, prioridad, estado) VALUES (?, ?, ?, CURDATE(), 'Checkout', 'Alta', 'Pendiente')`,
      [uuidv4(), req.hotel_id, reserva[0].habitacion_id]
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
    const [reserva] = await pool.query('SELECT habitacion_id FROM reservas WHERE id = ? AND hotel_id = ?', [req.params.id, req.hotel_id]);
    
    await pool.query(
      `UPDATE reservas SET estado = 'Cancelada', notas_internas = CONCAT(IFNULL(notas_internas,''), '\nCancelada: ', ?) WHERE id = ? AND hotel_id = ?`,
      [motivo || 'Sin motivo', req.params.id, req.hotel_id]
    );
    
    if (reserva[0]?.habitacion_id) {
      await pool.query(`UPDATE habitaciones SET estado_habitacion = 'Disponible' WHERE id = ? AND hotel_id = ?`, [reserva[0].habitacion_id, req.hotel_id]);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH confirmar
router.patch('/:id/confirmar', async (req, res) => {
  try {
    await pool.query(`UPDATE reservas SET estado = 'Confirmada' WHERE id = ? AND hotel_id = ?`, [req.params.id, req.hotel_id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
