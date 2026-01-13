const router = require('express').Router();
const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [users] = await pool.query('SELECT * FROM usuarios WHERE email = ? AND activo = TRUE', [email]);
    
    if (!users.length) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    await pool.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?', [user.id]);
    
    const token = jwt.sign(
      { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register (solo admin)
router.post('/register', async (req, res) => {
  try {
    const { email, password, nombre, rol } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();
    
    await pool.query(
      'INSERT INTO usuarios (id, email, password_hash, nombre, rol) VALUES (?, ?, ?, ?, ?)',
      [id, email, hashedPassword, nombre, rol || 'Recepcion']
    );
    
    res.status(201).json({ id, email, nombre, rol });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email ya registrado' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Setup admin - BORRAR DESPUÉS
router.get('/setup', async (req, res) => {
  try {
    const hash = await bcrypt.hash('123456', 10);
    await pool.query('DELETE FROM usuarios WHERE email = ?', ['diego.leon@uniline.mx']);
    await pool.query(
      'INSERT INTO usuarios (id, email, password_hash, nombre, rol, activo) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), 'diego.leon@uniline.mx', hash, 'Diego León', 'Admin', true]
    );
    res.json({ ok: true, message: 'Usuario creado' });
  } catch (e) {
    res.json({ error: e.message });
  }
});

module.exports = router;
// Debug - BORRAR DESPUÉS
router.get('/debug', async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, email, password_hash, activo FROM usuarios WHERE email = ?', ['diego.leon@uniline.mx']);
    if (!users.length) {
      return res.json({ error: 'Usuario no encontrado' });
    }
    const user = users[0];
    const testPassword = await bcrypt.compare('123456', user.password_hash);
    res.json({ 
      encontrado: true,
      activo: user.activo,
      passwordValido: testPassword,
      hashGuardado: user.password_hash.substring(0, 20) + '...'
    });
  } catch (e) {
    res.json({ error: e.message });
  }
});
