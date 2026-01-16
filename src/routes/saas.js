const router = require('express').Router();
const pool = require('../config/database');
const crypto = require('crypto');

const generateId = () => crypto.randomUUID();

// ==========================================
// 1. PLANES
// ==========================================

router.get('/planes', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM planes ORDER BY costo_mensual ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/planes', async (req, res) => {
  const { nombre, costo_mensual, limite_hoteles, limite_habitaciones_por_hotel } = req.body;
  try {
    const id = generateId();
    await pool.query(
      'INSERT INTO planes (id, nombre, costo_mensual, limite_hoteles, limite_habitaciones_por_hotel) VALUES (?, ?, ?, ?, ?)',
      [id, nombre, costo_mensual, limite_hoteles, limite_habitaciones_por_hotel]
    );
    res.status(201).json({ id, message: "Plan creado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/planes/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, costo_mensual, limite_hoteles, limite_habitaciones_por_hotel } = req.body;
  try {
    await pool.query(
      'UPDATE planes SET nombre = ?, costo_mensual = ?, limite_hoteles = ?, limite_habitaciones_por_hotel = ? WHERE id = ?',
      [nombre, costo_mensual, limite_hoteles, limite_habitaciones_por_hotel, id]
    );
    res.json({ message: "Plan actualizado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 2. CUENTAS
// ==========================================

router.get('/cuentas', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM hotel h WHERE h.cuenta_id = c.id) as total_hoteles 
      FROM cuentas c 
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/cuentas', async (req, res) => {
  const { razon_social, nombre_administrador, email_acceso, password, telefono } = req.body;
  try {
    const id = generateId();
    await pool.query(
      'INSERT INTO cuentas (id, razon_social, nombre_administrador, email_acceso, password, telefono, activo) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [id, razon_social, nombre_administrador, email_acceso, password, telefono]
    );
    res.status(201).json({ id, message: "Cliente creado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/cuentas/:id', async (req, res) => {
  const { id } = req.params;
  const { razon_social, nombre_administrador, email_acceso, telefono, activo } = req.body;
  try {
    await pool.query(
      'UPDATE cuentas SET razon_social = ?, nombre_administrador = ?, email_acceso = ?, telefono = ?, activo = ? WHERE id = ?',
      [razon_social, nombre_administrador, email_acceso, telefono, activo, id]
    );
    res.json({ message: "Cliente actualizado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/cuentas/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM cuentas WHERE id = ?', [req.params.id]);
    res.json({ message: "Cliente eliminado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 3. HOTELES
// ==========================================

router.get('/hoteles', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM hotel ORDER BY nombre');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/hoteles', async (req, res) => {
  const { cuenta_id, nombre, ciudad, telefono } = req.body;
  try {
    const id = generateId();
    await pool.query(
      'INSERT INTO hotel (id, cuenta_id, nombre, ciudad, telefono) VALUES (?, ?, ?, ?, ?)',
      [id, cuenta_id, nombre, ciudad, telefono]
    );
    res.status(201).json({ id, cuenta_id, nombre, ciudad, telefono });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/hoteles/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, ciudad, telefono } = req.body;
  try {
    await pool.query(
      'UPDATE hotel SET nombre = ?, ciudad = ?, telefono = ? WHERE id = ?',
      [nombre, ciudad, telefono, id]
    );
    res.json({ message: "Hotel actualizado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/hoteles/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM hotel WHERE id = ?', [req.params.id]);
    res.json({ message: "Hotel eliminado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 4. SUSCRIPCIONES (por hotel)
// ==========================================

router.get('/suscripciones', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        s.*, 
        c.razon_social as cuenta_nombre, 
        h.nombre as hotel_nombre,
        p.nombre as plan_nombre,
        p.costo_mensual,
        DATEDIFF(s.fecha_fin, NOW()) as dias_restantes
      FROM suscripciones s
      JOIN cuentas c ON s.cuenta_id = c.id
      LEFT JOIN hotel h ON s.hotel_id = h.id
      LEFT JOIN planes p ON s.plan_id = p.id
      ORDER BY s.fecha_fin ASC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/suscripciones', async (req, res) => {
  const { cuenta_id, hotel_id, plan_id, fecha_inicio, fecha_fin } = req.body;
  try {
    const id = generateId();
    await pool.query(`
      INSERT INTO suscripciones (id, cuenta_id, hotel_id, plan_id, fecha_inicio, fecha_fin, estado)
      VALUES (?, ?, ?, ?, ?, ?, 'activa')
    `, [id, cuenta_id, hotel_id, plan_id, fecha_inicio, fecha_fin]);
    res.status(201).json({ id, message: "Suscripción creada" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/suscripciones/:id/extender', async (req, res) => {
  const { id } = req.params;
  const { dias = 30 } = req.body;
  try {
    await pool.query(`
      UPDATE suscripciones 
      SET fecha_fin = DATE_ADD(GREATEST(fecha_fin, NOW()), INTERVAL ? DAY),
          estado = 'activa'
      WHERE id = ?
    `, [dias, id]);
    res.json({ message: "Suscripción extendida" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/suscripciones/:id', async (req, res) => {
  const { id } = req.params;
  const { plan_id, fecha_inicio, fecha_fin, estado } = req.body;
  try {
    await pool.query(
      'UPDATE suscripciones SET plan_id = ?, fecha_inicio = ?, fecha_fin = ?, estado = ? WHERE id = ?',
      [plan_id, fecha_inicio, fecha_fin, estado, id]
    );
    res.json({ message: "Suscripción actualizada" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/suscripciones/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM suscripciones WHERE id = ?', [req.params.id]);
    res.json({ message: "Suscripción eliminada" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 5. VISTAS COMBINADAS
// ==========================================

router.get('/hoteles-asignados', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        h.id, 
        h.nombre as hotel_nombre, 
        h.ciudad,
        c.razon_social as dueño, 
        p.nombre as plan_actual, 
        s.fecha_inicio,
        s.fecha_fin, 
        s.estado as suscripcion_estado,
        DATEDIFF(s.fecha_fin, NOW()) as dias_restantes
      FROM hotel h
      LEFT JOIN cuentas c ON h.cuenta_id = c.id
      LEFT JOIN suscripciones s ON s.hotel_id = h.id
      LEFT JOIN planes p ON s.plan_id = p.id
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Estado suscripción del hotel actual
router.get('/mi-suscripcion/:hotel_id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        s.*,
        p.nombre as plan_nombre,
        DATEDIFF(s.fecha_fin, NOW()) as dias_restantes
      FROM suscripciones s
      LEFT JOIN planes p ON s.plan_id = p.id
      WHERE s.hotel_id = ? AND s.estado = 'activa'
      ORDER BY s.fecha_fin DESC
      LIMIT 1
    `, [req.params.hotel_id]);
    
    if (rows.length === 0) {
      return res.json({ dias_restantes: -1, mensaje: 'Sin suscripción activa' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard resumen
router.get('/dashboard', async (req, res) => {
  try {
    const [[cuentas]] = await pool.query('SELECT COUNT(*) as total FROM cuentas WHERE activo = 1');
    const [[hoteles]] = await pool.query('SELECT COUNT(*) as total FROM hotel');
    const [[activas]] = await pool.query("SELECT COUNT(*) as total FROM suscripciones WHERE estado = 'activa'");
    const [[porVencer]] = await pool.query("SELECT COUNT(*) as total FROM suscripciones WHERE estado = 'activa' AND DATEDIFF(fecha_fin, NOW()) <= 7");
    const [[vencidas]] = await pool.query("SELECT COUNT(*) as total FROM suscripciones WHERE estado = 'activa' AND fecha_fin < NOW()");
    
    res.json({
      total_cuentas: cuentas.total,
      total_hoteles: hoteles.total,
      suscripciones_activas: activas.total,
      por_vencer: porVencer.total,
      vencidas: vencidas.total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
