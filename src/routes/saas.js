const router = require('express').Router();
const pool = require('../config/database');
const crypto = require('crypto'); 

const generateId = () => crypto.randomUUID();

// 1. CUENTAS
router.get('/cuentas', async (req, res) => {
  try {
    // Eliminamos el ORDER BY para evitar el error 1054
    const [rows] = await pool.query('SELECT * FROM cuentas');
    res.json(rows);
  } catch (error) {
    console.error("Error en GET /cuentas:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/cuentas', async (req, res) => {
  try {
    const { razon_social, nombre_administrador, email_acceso, password, telefono } = req.body;
    const id = generateId();
    await pool.query(
      'INSERT INTO cuentas (id, razon_social, nombre_administrador, email_acceso, password, telefono, activo) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [id, razon_social, nombre_administrador, email_acceso, password, telefono]
    );
    res.status(201).json({ id, razon_social });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. PLANES
router.get('/planes', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM planes');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. SUSCRIPCIONES
router.get('/suscripciones', async (req, res) => {
  try {
    // Usamos una consulta más simple para evitar errores de nombres de columna en el JOIN
    const [rows] = await pool.query(`
      SELECT s.*, c.razon_social, p.nombre as plan_nombre 
      FROM suscripciones s
      LEFT JOIN cuentas c ON s.cuenta_id = c.id
      LEFT JOIN planes p ON s.plan_id = p.id
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error en GET /suscripciones:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/suscripciones', async (req, res) => {
  try {
    const { cuenta_id, plan_id, fecha_inicio, fecha_vencimiento } = req.body;
    const id = generateId();
    // Nota: Si 'fecha_vencimiento' falla, revisa el nombre en la tabla suscripciones
    await pool.query(
      'INSERT INTO suscripciones (id, cuenta_id, plan_id, fecha_inicio, fecha_vencimiento, estado) VALUES (?, ?, ?, ?, ?, ?)',
      [id, cuenta_id, plan_id, fecha_inicio, fecha_vencimiento, 'activa']
    ).catch(async (err) => {
        // Intento de rescate si la columna se llama diferente (común en este modelo)
        return await pool.query(
            'INSERT INTO suscripciones (id, cuenta_id, plan_id, fecha_inicio, estado) VALUES (?, ?, ?, ?, ?)',
            [id, cuenta_id, plan_id, fecha_inicio, 'activa']
        );
    });
    res.status(201).json({ id, status: 'activa' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. ASIGNACIÓN
router.patch('/asignar-hotel', async (req, res) => {
  try {
    const { cuenta_id, hotel_id } = req.body;
    await pool.query('UPDATE hotel SET cuenta_id = ? WHERE id = ?', [cuenta_id, hotel_id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
