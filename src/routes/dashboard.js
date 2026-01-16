const router = require('express').Router();
const pool = require('../config/database');
const checkSubscription = require('../middleware/checkSubscription');

router.use(checkSubscription);

// GET estadísticas principales
router.get('/stats', async (req, res) => {
  try {
    const [habitaciones] = await pool.query(`
      SELECT 
        COUNT(*) as total_habitaciones,
        SUM(CASE WHEN estado_habitacion = 'Ocupada' THEN 1 ELSE 0 END) as ocupadas,
        SUM(CASE WHEN estado_habitacion = 'Disponible' THEN 1 ELSE 0 END) as disponibles,
        SUM(CASE WHEN estado_habitacion = 'Reservada' THEN 1 ELSE 0 END) as reservadas,
        SUM(CASE WHEN estado_habitacion = 'Limpieza' THEN 1 ELSE 0 END) as pendientes_limpieza,
        SUM(CASE WHEN estado_habitacion = 'Mantenimiento' THEN 1 ELSE 0 END) as pendientes_mantenimiento
      FROM habitaciones WHERE hotel_id = ? AND activo = TRUE
    `, [req.hotel_id]);

    const stats = habitaciones[0];
    
    // Ocupación = (Ocupadas + Reservadas + Limpieza + Mantenimiento) / Total
    const habitacionesOcupadas = (stats.ocupadas || 0) + (stats.reservadas || 0) + 
                                 (stats.pendientes_limpieza || 0) + (stats.pendientes_mantenimiento || 0);
    
    const ocupacionPorcentaje = stats.total_habitaciones > 0 
      ? Math.round((habitacionesOcupadas / stats.total_habitaciones) * 100) 
      : 0;

    res.json({
      ...stats,
      ocupacion_porcentaje: ocupacionPorcentaje
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET checkins de hoy
router.get('/checkins-hoy', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.id, r.numero_reserva, r.hora_llegada, r.adultos, r.ninos,
             c.nombre, c.apellido_paterno, c.es_vip,
             t.nombre as tipo_habitacion, h.numero as habitacion_numero
      FROM reservas r
      JOIN clientes c ON r.cliente_id = c.id
      JOIN tipos_habitacion t ON r.tipo_habitacion_id = t.id
      LEFT JOIN habitaciones h ON r.habitacion_id = h.id
      WHERE r.hotel_id = ? AND DATE(r.fecha_checkin) = CURDATE() 
      AND r.estado IN ('Pendiente', 'Confirmada')
      ORDER BY r.hora_llegada
      LIMIT 10
    `, [req.hotel_id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET checkouts de hoy
router.get('/checkouts-hoy', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.id, r.numero_reserva, r.saldo_pendiente,
             c.nombre, c.apellido_paterno,
             h.numero as habitacion_numero
      FROM reservas r
      JOIN clientes c ON r.cliente_id = c.id
      LEFT JOIN habitaciones h ON r.habitacion_id = h.id
      WHERE r.hotel_id = ? AND DATE(r.fecha_checkout) = CURDATE() 
      AND r.estado = 'CheckIn'
      ORDER BY r.fecha_checkout
      LIMIT 10
    `, [req.hotel_id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET ventas del día
router.get('/ventas-hoy', async (req, res) => {
  try {
    // Total cobrado HOY
    const [pagosHoy] = await pool.query(`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM pagos
      WHERE hotel_id = ? AND DATE(fecha) = CURDATE()
    `, [req.hotel_id]);
    
    // Desglose por concepto de cargos HOY
    const [cargosPorConcepto] = await pool.query(`
      SELECT 
        cc.tipo,
        COALESCE(SUM(ch.total), 0) as total
      FROM cargos_habitacion ch
      JOIN conceptos_cargo cc ON ch.concepto_cargo_id = cc.id
      JOIN reservas r ON ch.reserva_id = r.id
      WHERE r.hotel_id = ? AND DATE(ch.fecha) = CURDATE()
      GROUP BY cc.tipo
    `, [req.hotel_id]);
    
    // Mapear conceptos a categorías
    let alojamiento = 0;
    let alimentos = 0;
    let servicios = 0;
    
    cargosPorConcepto.forEach(c => {
      if (c.tipo === 'Hospedaje' || c.tipo === 'Alojamiento') {
        alojamiento += c.total;
      } else if (c.tipo === 'Alimentos' || c.tipo === 'Bebidas' || c.tipo === 'Alimentos y Bebidas') {
        alimentos += c.total;
      } else {
        servicios += c.total;
      }
    });
    
    const total = pagosHoy[0].total;
    
    res.json({
      total: total,
      alojamiento: alojamiento,
      alimentos: alimentos,
      servicios: servicios
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET tareas críticas
router.get('/tareas-criticas', async (req, res) => {
  try {
    const [limpieza] = await pool.query(`
      SELECT t.id, 'limpieza' as tipo_tarea, t.prioridad, t.estado,
             h.numero as habitacion_numero, h.piso
      FROM tareas_limpieza t
      JOIN habitaciones h ON t.habitacion_id = h.id
      WHERE t.hotel_id = ? AND t.estado IN ('Pendiente', 'EnProceso')
      AND t.prioridad IN ('Urgente', 'Alta')
      AND t.fecha = CURDATE()
      ORDER BY FIELD(t.prioridad, 'Urgente', 'Alta')
      LIMIT 5
    `, [req.hotel_id]);
    
    const [mantenimiento] = await pool.query(`
      SELECT t.id, 'mantenimiento' as tipo_tarea, t.prioridad, t.estado, t.titulo,
             h.numero as habitacion_numero, h.piso
      FROM tareas_mantenimiento t
      LEFT JOIN habitaciones h ON t.habitacion_id = h.id
      WHERE t.hotel_id = ? AND t.estado IN ('Pendiente', 'EnProceso')
      AND t.prioridad IN ('Urgente', 'Alta')
      ORDER BY FIELD(t.prioridad, 'Urgente', 'Alta')
      LIMIT 5
    `, [req.hotel_id]);
    
    res.json({
      limpieza,
      mantenimiento
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET ocupación por tipo de habitación
router.get('/ocupacion-tipo', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        t.id, t.nombre, t.codigo,
        COUNT(h.id) as total,
        SUM(CASE WHEN h.estado_habitacion = 'Ocupada' THEN 1 ELSE 0 END) as ocupadas,
        SUM(CASE WHEN h.estado_habitacion = 'Disponible' THEN 1 ELSE 0 END) as disponibles,
        SUM(CASE WHEN h.estado_habitacion = 'Reservada' THEN 1 ELSE 0 END) as reservadas
      FROM tipos_habitacion t
      LEFT JOIN habitaciones h ON t.id = h.tipo_id AND h.activo = TRUE
      WHERE t.hotel_id = ? AND t.activo = TRUE
      GROUP BY t.id, t.nombre, t.codigo
      ORDER BY t.precio_base
    `, [req.hotel_id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET ingresos del mes
router.get('/ingresos-mes', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        DATE(fecha) as dia,
        SUM(monto) as total
      FROM pagos
      WHERE hotel_id = ? AND MONTH(fecha) = MONTH(CURDATE())
      AND YEAR(fecha) = YEAR(CURDATE())
      GROUP BY DATE(fecha)
      ORDER BY dia
    `, [req.hotel_id]);
    
    const [total] = await pool.query(`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM pagos
      WHERE hotel_id = ? AND MONTH(fecha) = MONTH(CURDATE())
      AND YEAR(fecha) = YEAR(CURDATE())
    `, [req.hotel_id]);
    
    res.json({
      por_dia: rows,
      total_mes: total[0].total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET resumen semanal
router.get('/resumen-semanal', async (req, res) => {
  try {
    const [reservas] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN estado = 'CheckIn' THEN 1 ELSE 0 END) as checkins,
        SUM(CASE WHEN estado = 'CheckOut' THEN 1 ELSE 0 END) as checkouts,
        SUM(CASE WHEN estado = 'Cancelada' THEN 1 ELSE 0 END) as canceladas
      FROM reservas
      WHERE hotel_id = ? AND fecha_checkin >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    `, [req.hotel_id]);
    
    const [ingresos] = await pool.query(`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM pagos
      WHERE hotel_id = ? AND fecha >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    `, [req.hotel_id]);
    
    res.json({
      reservas: reservas[0],
      ingresos: ingresos[0].total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
