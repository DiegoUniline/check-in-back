const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const checkSubscription = require('../middleware/checkSubscription');

router.use(checkSubscription);

// GET tareas con filtros
router.get('/', async (req, res) => {
  try {
    const { fecha, estado, prioridad, asignado_a } = req.query;
    let sql = `
      SELECT t.*, h.numero as habitacion_numero, h.piso, th.nombre as tipo_habitacion
      FROM tareas_limpieza t
      JOIN habitaciones h ON t.habitacion_id = h.id
      JOIN tipos_habitacion th ON h.tipo_id = th.id
      WHERE t.hotel_id = ?
    `;
    const params = [req.hotel_id];
    
    if (fecha) { sql += ' AND t.fecha = ?'; params.push(fecha); }
    if (estado) { sql += ' AND t.estado = ?'; params.push(estado); }
    if (prioridad) { sql += ' AND t.prioridad = ?'; params.push(prioridad); }
    if (asignado_a) { sql += ' AND t.asignado_a = ?'; params.push(asignado_a); }
    
    sql += ' ORDER BY FIELD(t.prioridad, "Urgente", "Alta", "Normal", "Baja"), h.piso, h.numero';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET tareas de hoy
router.get('/hoy', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT t.*, h.numero as habitacion_numero, h.piso, th.nombre as tipo_habitacion
      FROM tareas_limpieza t
      JOIN habitaciones h ON t.habitacion_id = h.id
      JOIN tipos_habitacion th ON h.tipo_id = th.id
      WHERE t.hotel_id = ? AND t.fecha = CURDATE() AND t.estado != 'Verificada'
      ORDER BY FIELD(t.prioridad, "Urgente", "Alta", "Normal", "Baja"), h.piso
    `, [req.hotel_id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear tarea
router.post('/', async (req, res) => {
  try {
    const { habitacion_id, fecha, tipo, prioridad, asignado_a, asignado_nombre, notas } = req.body;
    const id = uuidv4();
    await pool.query(
      `INSERT INTO tareas_limpieza (id, hotel_id, habitacion_id, fecha, tipo, prioridad, estado, asignado_a, asignado_nombre, notas) VALUES (?,?,?,?,?,?,'Pendiente',?,?,?)`,
      [id, req.hotel_id, habitacion_id, fecha || new Date().toISOString().split('T')[0], tipo || 'Checkout', prioridad || 'Normal', asignado_a, asignado_nombre, notas]
    );
    res.status(201).json({ id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH actualizar estado
router.patch('/:id/estado', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const { estado } = req.body;
    const [tarea] = await conn.query('SELECT habitacion_id FROM tareas_limpieza WHERE id = ? AND hotel_id = ?', [req.params.id, req.hotel_id]);
    
    if (!tarea.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }
    
    let horaField = '';
    if (estado === 'EnProceso') horaField = ', hora_inicio = NOW()';
    if (estado === 'Completada' || estado === 'Verificada') horaField = ', hora_fin = NOW()';
    
    await conn.query(`UPDATE tareas_limpieza SET estado = ?${horaField} WHERE id = ? AND hotel_id = ?`, [estado, req.params.id, req.hotel_id]);
    
    if (estado === 'EnProceso') {
      await conn.query(`UPDATE habitaciones SET estado_limpieza = 'EnProceso' WHERE id = ? AND hotel_id = ?`, [tarea[0].habitacion_id, req.hotel_id]);
    } else if (estado === 'Completada') {
      await conn.query(`UPDATE habitaciones SET estado_limpieza = 'Inspeccion' WHERE id = ? AND hotel_id = ?`, [tarea[0].habitacion_id, req.hotel_id]);
    } else if (estado === 'Verificada') {
      await conn.query(`UPDATE habitaciones SET estado_limpieza = 'Limpia' WHERE id = ? AND hotel_id = ?`, [tarea[0].habitacion_id, req.hotel_id]);
    }
    
    await conn.commit();
    res.json({ success: true });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// PUT asignar
router.put('/:id/asignar', async (req, res) => {
  try {
    const { asignado_a, asignado_nombre } = req.body;
    await pool.query(
      `UPDATE tareas_limpieza SET asignado_a = ?, asignado_nombre = ? WHERE id = ? AND hotel_id = ?`,
      [asignado_a, asignado_nombre, req.params.id, req.hotel_id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tareas_limpieza WHERE id = ? AND hotel_id = ?', [req.params.id, req.hotel_id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
