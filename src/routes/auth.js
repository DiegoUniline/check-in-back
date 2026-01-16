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
      { 
        id: user.id, 
        email: user.email, 
        nombre: user.nombre, 
        rol: user.rol, 
        hotel_id: user.hotel_id,
        cuenta_id: user.cuenta_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: { 
        id: user.id, 
        email: user.email, 
        nombre: user.nombre, 
        rol: user.rol, 
        hotel_id: user.hotel_id,
        cuenta_id: user.cuenta_id
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, nombre, rol, hotel_id, cuenta_id } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();
    
    await pool.query(
      'INSERT INTO usuarios (id, email, password_hash, nombre, rol, hotel_id, cuenta_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, email, hashedPassword, nombre, rol || 'Recepcion', hotel_id || null, cuenta_id]
    );
    
    res.status(201).json({ id, email, nombre, rol, hotel_id, cuenta_id });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email ya registrado' });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
