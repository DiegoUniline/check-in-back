const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// -----------------------------------------------------------
// 1. CUENTAS (Empresas/Dueños)
// -----------------------------------------------------------

// GET todas las cuentas
router.get('/cuentas', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM cuentas ORDER BY nombre_propietario ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear cuenta
router.post('/cuentas', async (req, res) => {
  try {
    const { nombre_propietario, email_contacto, telefono, rfc } = req.body;
    const id = uuidv4();
    await pool.query(
      'INSERT INTO cuentas (id, nombre_propietario, email_contacto, telefono, rfc) VALUES (?, ?, ?, ?, ?)',
      [id, nombre_propietario, email_contacto, telefono, rfc]
    );
    res.status(201).json({ id, nombre_propietario });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -----------------------------------------------------------
// 2. PLANES (Precios y Niveles)
// -----------------------------------------------------------

// GET todos los planes
router.get('/planes', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM planes WHERE activo = 1 ORDER BY precio ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear plan
router.post('/planes', async (req, res) => {
  try {
    const { nombre, descripcion, precio, meses, limite_habitaciones } = req.body;
    const id = uuidv4();
    await pool.query(
      'INSERT INTO planes (id, nombre, descripcion, precio, meses, limite_habitaciones) VALUES (?, ?, ?, ?, ?, ?)',
      [id, nombre, descripcion, precio, meses, limite_habitaciones]
    );
    res.status(201).json({ id, nombre });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -----------------------------------------------------------
// 3. SUSCRIPCIONES (La unión de Cuenta + Plan)
// -----------------------------------------------------------

// GET todas las suscripciones con nombres de cuenta y plan
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

// POST crear suscripción (Activar plan a una cuenta)
router.post('/suscripciones', async (req, res) => {
  try {
    const { cuenta_id, plan_id, fecha_inicio, fecha_vencimiento } = req.body;
    const id = uuidv4();
    
    await pool.query(
      'INSERT INTO suscripciones (id, cuenta_id, plan_id, fecha_inicio, fecha_vencimiento, estado) VALUES (?, ?, ?, ?, ?, ?)',
      [id, cuenta_id, plan_id, fecha_inicio, fecha_vencimiento, 'activa']
    );
    
    res.status(201).json({ id, status: 'activa' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -----------------------------------------------------------
// 4. ASIGNACIÓN DE HOTELES
// -----------------------------------------------------------

// PATCH asignar hotel a una cuenta
router.patch('/asignar-hotel', async (req, res) => {
  try {
    const { cuenta_id, hotel_id } = req.body;
    await pool.query(
      'UPDATE hotel SET cuenta_id = ? WHERE id = ?',
      [cuenta_id, hotel_id]
    );
    res.json({ success: true, message: 'Hotel asignado a la cuenta' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
