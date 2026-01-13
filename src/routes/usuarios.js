const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// GET todos
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nombre, email, rol, activo, created_at, updated_at FROM usuarios WHERE activo = TRUE ORDER BY nombre`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET uno
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nombre, email, rol, activo, created_at, updated_at FROM usuarios WHERE id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST
router.post('/', async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body;
    
    // Verificar email único
    const [existing] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }
    
    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await pool.query(
      `INSERT INTO usuarios (id, nombre, email, password, rol) VALUES (?,?,?,?,?)`,
      [id, nombre, email, hashedPassword, rol || 'Recepcionista']
    );
    
    res.status(201).json({ id, nombre, email, rol: rol || 'Recepcionista' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT
router.put('/:id', async (req, res) => {
  try {
    const { nombre, email, password, rol, activo } = req.body;
    
    // Verificar email único (excepto el actual)
    const [existing] = await pool.query('SELECT id FROM usuarios WHERE email = ? AND id != ?', [email, req.params.id]);
    if (existing.length) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        `UPDATE usuarios SET nombre=?, email=?, password=?, rol=?, activo=? WHERE id=?`,
        [nombre, email, hashedPassword, rol, activo !== false, req.params.id]
      );
    } else {
      await pool.query(
        `UPDATE usuarios SET nombre=?, email=?, rol=?, activo=? WHERE id=?`,
        [nombre, email, rol, activo !== false, req.params.id]
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
    await pool.query('UPDATE usuarios SET activo = FALSE WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
