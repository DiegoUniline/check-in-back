const router = require('express').Router();
const pool = require('../config/database');
const crypto = require('crypto'); 

// Generador de ID para Heroku (sin librerías externas)
const generateId = () => crypto.randomUUID();

// -----------------------------------------------------------
// 1. CUENTAS (Basado en tu DESCRIBE: razon_social, email_acceso...)
// -----------------------------------------------------------
router.get('/cuentas', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM cuentas ORDER BY razon_social ASC');
    res.json(rows);
  } catch (error) {
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

// -----------------------------------------------------------
// 2. PLANES
// -----------------------------------------------------------
router.get('/planes', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM planes');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -----------------------------------------------------------
// 3. SUSCRIPCIONES (Basado en tu DESCRIBE: fecha_fin, cuenta_id...)
// -----------------------------------------------------------
router.get('/suscripciones', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.*, c.razon_social, p.nombre as plan_nombre 
      FROM suscripciones s
      JOIN cuentas c ON s.cuenta_id = c.id
      JOIN planes p ON s.plan_id = p.id
      ORDER BY s.fecha_fin DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/suscripciones', async (req, res) => {
  try {
    const { cuenta_id, plan_id, fecha_inicio, fecha_fin } = req.body;
    const id = generateId();
    await pool.query(
      'INSERT INTO suscripciones (id, cuenta_id, plan_id, fecha_inicio, fecha_fin, estado) VALUES (?, ?, ?, ?, ?, ?)',
      [id, cuenta_id, plan_id, fecha_inicio, fecha_fin, 'activa']
    );
    res.status(201).json({ id, status: 'activa' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -----------------------------------------------------------
// 4. ASIGNACIÓN DE HOTEL
// -----------------------------------------------------------
router.patch('/asignar-hotel', async (req, res) => {
  try {
    const { cuenta_id, hotel_id } = req.body;
    await pool.query('UPDATE hotel SET cuenta_id = ? WHERE id = ?', [cuenta_id, hotel_id]);
    res.json({ success: true, message: 'Hotel vinculado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
