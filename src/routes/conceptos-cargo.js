const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

router.get('/', async (req, res) => {
  try {
    const { categoria, activo } = req.query;
    let sql = 'SELECT * FROM conceptos_cargo WHERE 1=1';
    const params = [];
    if (categoria) { sql += ' AND categoria = ?'; params.push(categoria); }
    if (activo !== undefined) { sql += ' AND activo = ?'; params.push(activo); }
    sql += ' ORDER BY categoria, nombre';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { codigo, nombre, descripcion, precio_default, aplica_iva, categoria } = req.body;
    const id = uuidv4();
    await pool.query(
      'INSERT INTO conceptos_cargo (id, codigo, nombre, descripcion, precio_default, aplica_iva, categoria) VALUES (?,?,?,?,?,?,?)',
      [id, codigo, nombre, descripcion, precio_default || 0, aplica_iva ?? 1, categoria || 'Servicio']
    );
    res.status(201).json({ id, codigo, nombre });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { codigo, nombre, descripcion, precio_default, aplica_iva, categoria, activo } = req.body;
    await pool.query(
      'UPDATE conceptos_cargo SET codigo=?, nombre=?, descripcion=?, precio_default=?, aplica_iva=?, categoria=?, activo=? WHERE id=?',
      [codigo, nombre, descripcion, precio_default, aplica_iva, categoria, activo, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
