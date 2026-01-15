const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const checkSubscription = require('../middleware/checkSubscription');

// Middleware de protección SaaS
router.use(checkSubscription);

// GET all con filtros
router.get('/', async (req, res) => {
  try {
    const { estado, piso, tipo_id, limpieza, mantenimiento } = req.query;
    let sql = 'SELECT * FROM v_habitaciones_detalle WHERE hotel_id = ?';
    const params = [req.hotel_id];
    
    if (estado) { sql += ' AND estado_habitacion = ?'; params.push(estado); }
    if (piso) { sql += ' AND piso = ?'; params.push(piso); }
    if (tipo_id) { sql += ' AND tipo_id = ?'; params.push(tipo_id); }
    if (limpieza) { sql += ' AND estado_limpieza = ?'; params.push(limpieza); }
    if (mantenimiento) { sql += ' AND estado_mantenimiento = ?'; params.push(mantenimiento); }
    
    sql += ' ORDER BY piso, numero';
    const [rows] = await pool.query(sql, params);
    res.json(rows.map(r => ({ ...r, amenidades: JSON.parse(r.amenidades || '[]') })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET disponibles por fechas
router.get('/disponibles', async (req, res) => {
  try {
    const { checkin, checkout, tipo_id } = req.query;
    let sql = `
      SELECT h.*, t.nombre as tipo_nombre, t.precio_base, t.capacidad_maxima
      FROM habitaciones h
      JOIN tipos_habitacion t ON h.tipo_id = t.id
      WHERE h.hotel_id = ? AND h.activo = TRUE 
      AND h.estado_mantenimiento != 'FueraServicio'
      AND h.id NOT IN (
        SELECT DISTINCT habitacion_id FROM reservas 
        WHERE habitacion_id IS NOT NULL
        AND hotel_id = ?
        AND estado NOT IN ('Cancelada', 'NoShow', 'CheckOut')
        AND fecha_checkin < ? AND fecha_checkout > ?
      )
    `;
    const params = [req.hotel_id, req.hotel_id, checkout, checkin];
    if (tipo_id) { sql += ' AND h.tipo_id = ?'; params.push(tipo_id); }
    sql += ' ORDER BY h.piso, h.numero';
    
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET one
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v_habitaciones_detalle WHERE id = ? AND hotel_id = ?', [req.params.id, req.hotel_id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    rows[0].amenidades = JSON.parse(rows[0].amenidades || '[]');
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST
router.post('/', async (req, res) => {
  try {
    const { tipo_id, numero, piso, estado_habitacion, estado_limpieza, estado_mantenimiento, notas } = req.body;
    const id = uuidv4();
    await pool.query(
      `INSERT INTO habitaciones (id, hotel_id, tipo_id, numero, piso, estado_habitacion, estado_limpieza, estado_mantenimiento, notas) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, req.hotel_id, tipo_id, numero, piso, estado_habitacion || 'Disponible', estado_limpieza || 'Limpia', estado_mantenimiento || 'OK', notas]
    );
    res.status(201).json({ id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT
router.put('/:id', async (req, res) => {
  try {
    const { tipo_id, numero, piso, estado_habitacion, estado_limpieza, estado_mantenimiento, notas } = req.body;
    await pool.query(
      `UPDATE habitaciones SET tipo_id=?, numero=?, piso=?, estado_habitacion=?, estado_limpieza=?, estado_mantenimiento=?, notas=? WHERE id=? AND hotel_id=?`,
      [tipo_id, numero, piso, estado_habitacion, estado_limpieza, estado_mantenimiento, notas, req.params.id, req.hotel_id]
    );
    res.json({ id: req.params.id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH estado
router.patch('/:id/estado', async (req, res) => {
  try {
    const { estado_habitacion, estado_limpieza, estado_mantenimiento } = req.body;
    const updates = [];
    const params = [];
    
    if (estado_habitacion) { updates.push('estado_habitacion = ?'); params.push(estado_habitacion); }
    if (estado_limpieza) { updates.push('estado_limpieza = ?'); params.push(estado_limpieza); }
    if (estado_mantenimiento) { updates.push('estado_mantenimiento = ?'); params.push(estado_mantenimiento); }
    
    if (!updates.length) return res.status(400).json({ error: 'Sin cambios' });
    
    params.push(req.params.id, req.hotel_id);
    await pool.query(`UPDATE habitaciones SET ${updates.join(', ')} WHERE id = ? AND hotel_id = ?`, params);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE (soft)
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE habitaciones SET activo = FALSE WHERE id = ? AND hotel_id = ?', [req.params.id, req.hotel_id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
