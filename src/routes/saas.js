const router = require('express').Router();
const pool = require('../config/database');
const crypto = require('crypto'); 

// Función para generar IDs compatibles con tu columna varchar(36)
const generateId = () => crypto.randomUUID();

// -----------------------------------------------------------
// 1. CUENTAS (Empresas/Dueños)
// -----------------------------------------------------------

// GET todas las cuentas (Ajustado a tus columnas reales)
router.get('/cuentas', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, razon_social, nombre_administrador, email_acceso, telefono, activo, created_at FROM cuentas ORDER BY razon_social ASC');
    res.json(rows);
  } catch (error) {
    console.error("Error en GET /cuentas:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST crear cuenta (Ajustado a tus columnas reales)
router.post('/cuentas', async (req, res) => {
  try {
    const { razon_social, nombre_administrador, email_acceso, password, telefono } = req.body;
    const id = generateId();
    
    await pool.query(
      'INSERT INTO cuentas (id, razon_social, nombre_administrador, email_acceso, password, telefono, activo) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [id, razon_social, nombre_administrador, email_acceso, password, telefono]
    );
    
    res.status(201).json({ id, razon_social, message: "Cuenta creada correctamente" });
  } catch (error) {
    console.error("Error en POST /cuentas:", error);
    res.status(500).json({ error: error.message });
  }
});

// -----------------------------------------------------------
// 2. PLANES
// -----------------------------------------------------------

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

// -----------------------------------------------------------
// 3. SUSCRIPCIONES
// -----------------------------------------------------------

router.get('/suscripciones', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.*, c.razon_social, p.nombre as plan_nombre 
      FROM suscripciones s
      JOIN cuentas c ON s.cuenta_id = c.id
      JOIN planes p ON s.plan_id = p.id
      ORDER BY s.fecha_vencimiento DESC
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

router.patch('/asignar-hotel', async (req, res) => {
  try {
    const { cuenta_id, hotel_id } = req.body;
    await pool.query(
      'UPDATE hotel SET cuenta_id = ? WHERE id = ?',
      [cuenta_id, hotel_id]
    );
    res.json({ success: true, message: 'Hotel vinculado a la cuenta empresarial' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
