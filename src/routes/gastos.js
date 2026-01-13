const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// GET all con filtros
router.get('/', async (req, res) => {
  try {
    const { categoria, fecha_desde, fecha_hasta, metodo_pago } = req.query;
    let sql = 'SELECT * FROM gastos WHERE 1=1';
    const params = [];
    
    if (categoria) { sql += ' AND categoria = ?'; params.push(categoria); }
    if (fecha_desde) { sql += ' AND fecha >= ?'; params.push(fecha_desde); }
    if (fecha_hasta) { sql += ' AND fecha <= ?'; params.push(fecha_hasta); }
    if (metodo_pago) { sql += ' AND metodo_pago = ?'; params.push(metodo_pago); }
    
    sql += ' ORDER BY fecha DESC, created_at DESC LIMIT 500';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET categorías únicas
router.get('/categorias', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT DISTINCT categoria FROM gastos ORDER BY categoria');
    res.json(rows.map(r => r.categoria));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET resumen por período
router.get('/resumen', async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta } = req.query;
    let sql = `
      SELECT 
        categoria,
        COUNT(*) as cantidad,
        SUM(monto) as total
      FROM gastos
      WHERE 1=1
    `;
    const params = [];
    
    if (fecha_desde) { sql += ' AND fecha >= ?'; params.push(fecha_desde); }
    if (fecha_hasta) { sql += ' AND fecha <= ?'; params.push(fecha_hasta); }
    
    sql += ' GROUP BY categoria ORDER BY total DESC';
    const [rows] = await pool.query(sql, params);
    
    const [totalRow] = await pool.query(
      `SELECT SUM(monto) as total FROM gastos WHERE fecha >= ? AND fecha <= ?`,
      [fecha_desde || '1900-01-01', fecha_hasta || '2100-12-31']
    );
    
    res.json({ 
      por_categoria: rows, 
      total: totalRow[0].total || 0 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET one
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM gastos WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST
router.post('/', async (req, res) => {
  try {
    const { categoria, concepto, descripcion, monto, fecha, metodo_pago, proveedor, factura, notas } = req.body;
    const id = uuidv4();
    await pool.query(
      `INSERT INTO gastos (id, categoria, concepto, descripcion, monto, fecha, metodo_pago, proveedor, factura, notas) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, categoria, concepto, descripcion, monto, fecha, metodo_pago || 'Efectivo', proveedor, factura, notas]
    );
    res.status(201).json({ id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT
router.put('/:id', async (req, res) => {
  try {
    const { categoria, concepto, descripcion, monto, fecha, metodo_pago, proveedor, factura, notas } = req.body;
    await pool.query(
      `UPDATE gastos SET categoria=?, concepto=?, descripcion=?, monto=?, fecha=?, metodo_pago=?, proveedor=?, factura=?, notas=? WHERE id=?`,
      [categoria, concepto, descripcion, monto, fecha, metodo_pago, proveedor, factura, notas, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM gastos WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
