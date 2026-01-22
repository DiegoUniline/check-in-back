const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const checkSubscription = require('../middleware/checkSubscription');

router.use(checkSubscription);

// GET all
router.get('/', async (req, res) => {
  try {
    const { estado, tipo, prioridad, habitacion_id } = req.query;
    let sql = `
      SELECT t.*, h.numero as habitacion_numero, h.piso
      FROM tareas_mantenimiento t
      LEFT JOIN habitaciones h ON t.habitacion_id = h.id
      WHERE t.hotel_id = ?
    `;
    const params = [req.hotel_id];
    
    if (estado) { sql += ' AND t.estado = ?'; params.push(estado); }
    if (tipo) { sql += ' AND t.tipo = ?'; params.push(tipo); }
    if (prioridad) { sql += ' AND t.prioridad = ?'; params.push(prioridad); }
    if (habitacion_id) { sql += ' AND t.habitacion_id = ?'; params.push(habitacion_id); }
    
    sql += ' ORDER BY FIELD(t.prioridad, "Urgente", "Alta", "Normal", "Baja"), t.fecha_reporte DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET pendientes
router.get('/pendientes', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT t.*, h.numero as habitacion_numero, h.piso
      FROM tareas_mantenimiento t
      LEFT JOIN habitaciones h ON t.habitacion_id = h.id
      WHERE t.hotel_id = ? AND t.estado IN ('Pendiente', 'EnProceso')
      ORDER BY FIELD(t.prioridad, "Urgente", "Alta", "Normal", "Baja")
    `, [req.hotel_id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const { habitacion_id, titulo, descripcion, tipo, prioridad, asignado_a, asignado_nombre, fecha_programada, costo_estimado, notas } = req.body;
    const id = uuidv4();
    
    await conn.query(
      `INSERT INTO tareas_mantenimiento (id, hotel_id, habitacion_id, titulo, descripcion, tipo, prioridad, estado, asignado_a, asignado_nombre, fecha_reporte, fecha_programada, costo_estimado, notas) VALUES (?,?,?,?,?,?,?,'Pendiente',?,?,CURDATE(),?,?,?)`,
      [id, req.hotel_id, habitacion_id, titulo, descripcion, tipo || 'Correctivo', prioridad || 'Normal', asignado_a, asignado_nombre, fecha_programada, costo_estimado, notas]
    );
    
    if (habitacion_id && (prioridad === 'Urgente' || prioridad === 'Alta')) {
      await conn.query(`UPDATE habitaciones SET estado_mantenimiento = 'Pendiente' WHERE id = ? AND hotel_id = ?`, [habitacion_id, req.hotel_id]);
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

// PATCH estado
router.patch('/:id/estado', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const { estado, costo_real } = req.body;

    /*
      Normalización defensiva de estados (evita bugs por diferencias de string entre front/back).
      - Consumido por `Check-In-Front/src/pages/Mantenimiento.tsx` vía `api.updateEstadoMantenimiento(...)`.
      - El schema real define `tareas_mantenimiento.estado` como ENUM('Pendiente','EnProceso','Completada','Cancelada').
      - Históricamente en el front se usó `Completado` (masculino). Aquí lo convertimos a `Completada`.
    */
    let estadoNormalizado = estado;
    if (typeof estadoNormalizado === 'string') {
      estadoNormalizado = estadoNormalizado.trim();
      if (estadoNormalizado === 'En Proceso') estadoNormalizado = 'EnProceso';
      if (estadoNormalizado === 'Abierto') estadoNormalizado = 'Pendiente';
      if (['Completado', 'Resuelto', 'Cerrado'].includes(estadoNormalizado)) estadoNormalizado = 'Completada';
    }
    const [tarea] = await conn.query('SELECT habitacion_id FROM tareas_mantenimiento WHERE id = ? AND hotel_id = ?', [req.params.id, req.hotel_id]);
    
    if (!tarea.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }
    
    let extraFields = '';
    const params = [estadoNormalizado];
    
    if (estadoNormalizado === 'Completada') {
      extraFields = ', fecha_completada = CURDATE()';
      if (costo_real !== undefined) {
        extraFields += ', costo_real = ?';
        params.push(costo_real);
      }
    }
    
    params.push(req.params.id, req.hotel_id);
    await conn.query(`UPDATE tareas_mantenimiento SET estado = ?${extraFields} WHERE id = ? AND hotel_id = ?`, params);
    
    if (tarea[0]?.habitacion_id) {
      if (estadoNormalizado === 'EnProceso') {
        await conn.query(`UPDATE habitaciones SET estado_mantenimiento = 'EnProceso' WHERE id = ? AND hotel_id = ?`, [tarea[0].habitacion_id, req.hotel_id]);
      } else if (estadoNormalizado === 'Completada') {
        const [pendientes] = await conn.query(
          `SELECT COUNT(*) as count FROM tareas_mantenimiento WHERE habitacion_id = ? AND hotel_id = ? AND estado IN ('Pendiente', 'EnProceso') AND id != ?`,
          [tarea[0].habitacion_id, req.hotel_id, req.params.id]
        );
        if (pendientes[0].count === 0) {
          /*
            Relacionado con `Check-In-Front/src/pages/Habitaciones.tsx`:
            - Para que una habitación "aparezca en Disponible", el front usa `estado_habitacion === 'Disponible'`.
            - Cuando se termina mantenimiento, además de `estado_mantenimiento = 'OK'` debemos liberar la habitación
              si estaba bloqueada por mantenimiento.
            Regla de seguridad:
            - Solo cambiamos `estado_habitacion` si actualmente está en `Bloqueada` (no tocamos `Ocupada/Reservada`).
          */
          await conn.query(
            `UPDATE habitaciones
             SET
               estado_mantenimiento = 'OK',
               estado_habitacion = CASE
                 WHEN estado_habitacion IS NULL THEN 'Disponible'
                 WHEN TRIM(estado_habitacion) = '' THEN 'Disponible'
                 WHEN estado_habitacion = 'Bloqueada' THEN 'Disponible'
                 ELSE estado_habitacion
               END
             WHERE id = ? AND hotel_id = ?`,
            [tarea[0].habitacion_id, req.hotel_id]
          );
        }
      }
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

// PUT
router.put('/:id', async (req, res) => {
  try {
    const { titulo, descripcion, tipo, prioridad, asignado_a, asignado_nombre, fecha_programada, costo_estimado, notas } = req.body;
    await pool.query(
      `UPDATE tareas_mantenimiento SET titulo=?, descripcion=?, tipo=?, prioridad=?, asignado_a=?, asignado_nombre=?, fecha_programada=?, costo_estimado=?, notas=? WHERE id=? AND hotel_id=?`,
      [titulo, descripcion, tipo, prioridad, asignado_a, asignado_nombre, fecha_programada, costo_estimado, notas, req.params.id, req.hotel_id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tareas_mantenimiento WHERE id = ? AND hotel_id = ?', [req.params.id, req.hotel_id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
