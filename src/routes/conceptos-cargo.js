const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const checkSubscription = require('../middleware/checkSubscription');

router.use(checkSubscription);

// Helper para obtener cuenta_id del hotel
const getCuentaId = async (hotel_id) => {
  const [rows] = await pool.query('SELECT cuenta_id FROM hotel WHERE id = ?', [hotel_id]);
  return rows[0]?.cuenta_id;
};

router.get('/', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { categoria, activo } = req.query;
    let sql = 'SELECT * FROM conceptos_cargo WHERE cuenta_id = ?';
    const params = [cuenta_id];
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
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { codigo, nombre, descripcion, precio_default, aplica_iva, categoria } = req.body;
    const id = uuidv4();
    await pool.query(
      'INSERT INTO conceptos_cargo (id, cuenta_id, codigo, nombre, descripcion, precio_default, aplica_iva, categoria) VALUES (?,?,?,?,?,?,?,?)',
      [id, cuenta_id, codigo, nombre, descripcion, precio_default || 0, aplica_iva ?? 1, categoria || 'Servicio']
    );
    res.status(201).json({ id, codigo, nombre });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { codigo, nombre, descripcion, precio_default, aplica_iva, categoria, activo } = req.body;
    await pool.query(
      'UPDATE conceptos_cargo SET codigo=?, nombre=?, descripcion=?, precio_default=?, aplica_iva=?, categoria=?, activo=? WHERE id=? AND cuenta_id=?',
      [codigo, nombre, descripcion, precio_default, aplica_iva, categoria, activo, req.params.id, cuenta_id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    await pool.query('UPDATE conceptos_cargo SET activo = 0 WHERE id = ? AND cuenta_id = ?', [req.params.id, cuenta_id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
