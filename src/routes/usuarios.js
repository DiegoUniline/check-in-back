const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const checkSubscription = require('../middleware/checkSubscription');

router.use(checkSubscription);

// Helper para obtener cuenta_id del hotel
const getCuentaId = async (hotel_id) => {
  const [rows] = await pool.query('SELECT cuenta_id FROM hotel WHERE id = ?', [hotel_id]);
  return rows[0]?.cuenta_id;
};

// GET todos
router.get('/', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const [rows] = await pool.query(
      `SELECT id, nombre, email, rol, hotel_id, activo, created_at, updated_at FROM usuarios WHERE cuenta_id = ? AND activo = TRUE ORDER BY nombre`,
      [cuenta_id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET uno
router.get('/:id', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const [rows] = await pool.query(
      `SELECT id, nombre, email, rol, hotel_id, activo, created_at, updated_at FROM usuarios WHERE id = ? AND cuenta_id = ?`,
      [req.params.id, cuenta_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET roles disponibles
router.get('/roles', async (req, res) => {
  res.json(['Admin', 'Gerente', 'Recepcion', 'Housekeeping', 'Mantenimiento', 'Restaurante']);
});

// POST
router.post('/', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { nombre, email, password, rol, hotel_id } = req.body;
    
    const [existing] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }
    
    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await pool.query(
      `INSERT INTO usuarios (id, cuenta_id, hotel_id, nombre, email, password_hash, rol) VALUES (?,?,?,?,?,?,?)`,
      [id, cuenta_id, hotel_id || req.hotel_id, nombre, email, hashedPassword, rol || 'Recepcion']
    );
    
    res.status(201).json({ id, nombre, email, rol: rol || 'Recepcion' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT
router.put('/:id', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { nombre, email, password, rol, hotel_id, activo } = req.body;
    
    const [existing] = await pool.query('SELECT id FROM usuarios WHERE email = ? AND id != ?', [email, req.params.id]);
    if (existing.length) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        `UPDATE usuarios SET nombre=?, email=?, password_hash=?, rol=?, hotel_id=?, activo=? WHERE id=? AND cuenta_id=?`,
        [nombre, email, hashedPassword, rol, hotel_id, activo !== false, req.params.id, cuenta_id]
      );
    } else {
      await pool.query(
        `UPDATE usuarios SET nombre=?, email=?, rol=?, hotel_id=?, activo=? WHERE id=? AND cuenta_id=?`,
        [nombre, email, rol, hotel_id, activo !== false, req.params.id, cuenta_id]
      );
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE (soft)
router.delete('/:id', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    await pool.query('UPDATE usuarios SET activo = FALSE WHERE id = ? AND cuenta_id = ?', [req.params.id, cuenta_id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
