const router = require('express').Router();
const pool = require('../config/database');

// GET estadísticas principales
router.get('/stats', async (req, res) => {
  try {
    const [stats] = await pool.query('SELECT * FROM v_dashboard_stats');
    
    const ocupacionPorcentaje = stats[0].total_habitaciones > 0 
      ? Math.round((stats[0].ocupadas / stats[0].total_habitaciones) * 100) 
      : 0;
    
    res.json({
      ...stats[0],
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
      WHERE DATE(r.fecha_checkin) = CURDATE() 
      AND r.estado IN ('Pendiente', 'Confirmada')
      ORDER BY r.hora_llegada
      LIMIT 10
    `);
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
      WHERE DATE(r.fecha_checkout) = CURDATE() 
      AND r.estado = 'CheckIn'
      ORDER BY r.fecha_checkout
      LIMIT 10
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET ventas del día
router.get('/ventas-hoy', async (req, res) => {
  try {
    // Pagos del día
    const [pagos] = await pool.query(`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM pagos
      WHERE DATE(fecha) = CURDATE()
    `);
    
    // Cargos del día
    const [cargos] = await pool.query(`
      SELECT COALESCE(SUM(total), 0) as total
      FROM cargos_habitacion
      WHERE DATE(fecha) = CURDATE()
    `);
    
    // Desglose por método de pago
    const [porMetodo] = await pool.query(`
      SELECT metodo_pago, SUM(monto) as total
      FROM pagos
      WHERE DATE(fecha) = CURDATE()
      GROUP BY metodo_pago
    `);
    
    res.json({
      total_cobrado: pagos[0].total,
      total_cargos: cargos[0].total,
      por_metodo: porMetodo
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET tareas críticas
router.get('/tareas-criticas', async (req, res) => {
  try {
    // Limpieza urgente/alta
    const [limpieza] = await pool.query(`
      SELECT t.id, 'limpieza' as tipo_tarea, t.prioridad, t.estado,
             h.numero as habitacion_numero, h.piso
      FROM tareas_limpieza t
      JOIN habitaciones h ON t.habitacion_id = h.id
      WHERE t.estado IN ('Pendiente', 'EnProceso')
      AND t.prioridad IN ('Urgente', 'Alta')
      AND t.fecha = CURDATE()
      ORDER BY FIELD(t.prioridad, 'Urgente', 'Alta')
      LIMIT 5
    `);
    
    // Mantenimiento urgente/alto
    const [mantenimiento] = await pool.query(`
      SELECT t.id, 'mantenimiento' as tipo_tarea, t.prioridad, t.estado, t.titulo,
             h.numero as habitacion_numero, h.piso
      FROM tareas_mantenimiento t
      LEFT JOIN habitaciones h ON t.habitacion_id = h.id
      WHERE t.estado IN ('Pendiente', 'EnProceso')
      AND t.prioridad IN ('Urgente', 'Alta')
      ORDER BY FIELD(t.prioridad, 'Urgente', 'Alta')
      LIMIT 5
    `);
    
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
      WHERE t.activo = TRUE
      GROUP BY t.id, t.nombre, t.codigo
      ORDER BY t.precio_base
    `);
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
      WHERE MONTH(fecha) = MONTH(CURDATE())
      AND YEAR(fecha) = YEAR(CURDATE())
      GROUP BY DATE(fecha)
      ORDER BY dia
    `);
    
    const [total] = await pool.query(`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM pagos
      WHERE MONTH(fecha) = MONTH(CURDATE())
      AND YEAR(fecha) = YEAR(CURDATE())
    `);
    
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
      WHERE fecha_checkin >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    `);
    
    const [ingresos] = await pool.query(`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM pagos
      WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    `);
    
    res.json({
      reservas: reservas[0],
      ingresos: ingresos[0].total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
