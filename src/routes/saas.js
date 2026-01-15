const router = require('express').Router();
const pool = require('../config/database');
const crypto = require('crypto'); // NO requiere instalación, ya viene en Node.js

// Función para generar IDs (reemplaza a uuidv4)
const generateId = () => crypto.randomUUID();

// 1. CUENTAS
router.get('/cuentas', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM cuentas ORDER BY nombre_propietario ASC');
    res.json(rows);
  } catch (error) {
    console.error("Error en cuentas:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/cuentas', async (req, res) => {
  try {
    const { nombre_propietario, email_contacto, telefono, rfc } = req.body;
    const id = generateId();
    await pool.query(
      'INSERT INTO cuentas (id, nombre_propietario, email_contacto, telefono, rfc) VALUES (?, ?, ?, ?, ?)',
      [id, nombre_propietario, email_contacto, telefono, rfc]
    );
    res.status(201).json({ id, nombre_propietario });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. PLANES
router.get('/planes', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM planes WHERE activo = 1 ORDER BY precio ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/planes', async (req, res) => {
  try {
    const { nombre, descripcion, precio, meses, limite_habitaciones } = req.body;
    const id = generateId();
    await pool.query(
      'INSERT INTO planes (id, nombre, descripcion, precio, meses, limite_habitaciones) VALUES (?, ?, ?, ?, ?, ?)',
      [id, nombre, descripcion, precio, meses, limite_habitaciones]
    );
    res.status(201).json({ id, nombre });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. SUSCRIPCIONES
router.get('/suscripciones', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.*, c.nombre_propietario, p.nombre as plan_nombre 
      FROM suscripciones s
      JOIN cuentas c ON s.cuenta_id = c.id
      JOIN planes p ON s.plan_id = p.id
      ORDER BY s.fecha_vencimiento DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/suscripciones', async (req, res) => {
  try {
    const { cuenta_id, plan_id, fecha_inicio, fecha_vencimiento } = req.body;
    const id = generateId();
    await pool.query(
      'INSERT INTO suscripciones (id, cuenta_id, plan_id, fecha_inicio, fecha_vencimiento, estado) VALUES (?, ?, ?, ?, ?, ?)',
      [id, cuenta_id, plan_id, fecha_inicio, fecha_vencimiento, 'activa']
    );
    res.status(201).json({ id, status: 'activa' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
