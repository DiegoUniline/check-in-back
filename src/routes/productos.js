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

// GET categorías
router.get('/categorias', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const [rows] = await pool.query('SELECT * FROM categorias_producto WHERE cuenta_id = ? AND activo = TRUE ORDER BY nombre', [cuenta_id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST categoría
router.post('/categorias', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { nombre, descripcion } = req.body;
    const id = uuidv4();
    await pool.query('INSERT INTO categorias_producto (id, cuenta_id, nombre, descripcion) VALUES (?,?,?,?)', [id, cuenta_id, nombre, descripcion]);
    res.status(201).json({ id, nombre, descripcion });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET productos
router.get('/', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { categoria_id, search, stock_bajo } = req.query;
    let sql = `
      SELECT p.*, c.nombre as categoria_nombre
      FROM productos p
      LEFT JOIN categorias_producto c ON p.categoria_id = c.id
      WHERE p.cuenta_id = ? AND p.activo = TRUE
    `;
    const params = [cuenta_id];
    
    if (categoria_id) { sql += ' AND p.categoria_id = ?'; params.push(categoria_id); }
    if (search) { 
      sql += ' AND (p.nombre LIKE ? OR p.codigo LIKE ?)'; 
      params.push(`%${search}%`, `%${search}%`); 
    }
    if (stock_bajo === 'true') { sql += ' AND p.stock_actual <= p.stock_minimo'; }
    
    sql += ' ORDER BY p.nombre';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET one
router.get('/:id', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const [rows] = await pool.query(
      `SELECT p.*, c.nombre as categoria_nombre FROM productos p LEFT JOIN categorias_producto c ON p.categoria_id = c.id WHERE p.id = ? AND p.cuenta_id = ?`,
      [req.params.id, cuenta_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST producto
router.post('/', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { categoria_id, codigo, nombre, descripcion, precio_compra, precio_venta, stock_actual, stock_minimo, unidad, imagen } = req.body;
    const id = uuidv4();
    await pool.query(
      `INSERT INTO productos (id, cuenta_id, categoria_id, codigo, nombre, descripcion, precio_compra, precio_venta, stock_actual, stock_minimo, unidad, imagen) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, cuenta_id, categoria_id, codigo, nombre, descripcion, precio_compra || 0, precio_venta, stock_actual || 0, stock_minimo || 5, unidad || 'PZA', imagen]
    );
    res.status(201).json({ id, ...req.body });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Código duplicado' });
    res.status(500).json({ error: error.message });
  }
});

// PUT producto
router.put('/:id', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { categoria_id, codigo, nombre, descripcion, precio_compra, precio_venta, stock_minimo, unidad, imagen } = req.body;
    await pool.query(
      `UPDATE productos SET categoria_id=?, codigo=?, nombre=?, descripcion=?, precio_compra=?, precio_venta=?, stock_minimo=?, unidad=?, imagen=? WHERE id=? AND cuenta_id=?`,
      [categoria_id, codigo, nombre, descripcion, precio_compra, precio_venta, stock_minimo, unidad, imagen, req.params.id, cuenta_id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST movimiento de inventario
router.post('/:id/movimiento', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { tipo, cantidad, referencia, notas } = req.body;
    
    const [producto] = await conn.query('SELECT stock_actual FROM productos WHERE id = ? AND cuenta_id = ?', [req.params.id, cuenta_id]);
    if (!producto.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    const stockAnterior = producto[0].stock_actual;
    let stockNuevo;
    
    if (tipo === 'Entrada') {
      stockNuevo = stockAnterior + cantidad;
    } else if (tipo === 'Salida' || tipo === 'Venta') {
      if (stockAnterior < cantidad) {
        await conn.rollback();
        return res.status(400).json({ error: 'Stock insuficiente' });
      }
      stockNuevo = stockAnterior - cantidad;
    } else if (tipo === 'Ajuste') {
      stockNuevo = cantidad;
    }
    
    await conn.query(
      `INSERT INTO movimientos_inventario (id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia, notas) VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), req.params.id, tipo, cantidad, stockAnterior, stockNuevo, referencia, notas]
    );
    
    await conn.query('UPDATE productos SET stock_actual = ? WHERE id = ? AND cuenta_id = ?', [stockNuevo, req.params.id, cuenta_id]);
    
    await conn.commit();
    res.json({ stock_anterior: stockAnterior, stock_nuevo: stockNuevo });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// GET movimientos de un producto
router.get('/:id/movimientos', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM movimientos_inventario WHERE producto_id = ? ORDER BY created_at DESC LIMIT 100',
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST cargo a habitación
router.post('/cargo-habitacion', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { reserva_id, producto_id, concepto, cantidad, precio_unitario, notas } = req.body;
    
    const subtotal = cantidad * precio_unitario;
    const impuesto = subtotal * 0.16;
    const total = subtotal + impuesto;
    
    await conn.query(
      `INSERT INTO cargos_habitacion (id, reserva_id, producto_id, concepto, cantidad, precio_unitario, subtotal, impuesto, total, notas) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), reserva_id, producto_id, concepto, cantidad, precio_unitario, subtotal, impuesto, total, notas]
    );
    
    await conn.query(
      `UPDATE reservas SET total = total + ?, saldo_pendiente = saldo_pendiente + ? WHERE id = ? AND hotel_id = ?`,
      [total, total, reserva_id, req.hotel_id]
    );
    
    if (producto_id) {
      const [prod] = await conn.query('SELECT stock_actual FROM productos WHERE id = ? AND cuenta_id = ?', [producto_id, cuenta_id]);
      if (prod.length && prod[0].stock_actual >= cantidad) {
        await conn.query('UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ? AND cuenta_id = ?', [cantidad, producto_id, cuenta_id]);
        await conn.query(
          `INSERT INTO movimientos_inventario (id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia) VALUES (?,?,'Venta',?,?,?,?)`,
          [uuidv4(), producto_id, cantidad, prod[0].stock_actual, prod[0].stock_actual - cantidad, `Cargo reserva ${reserva_id}`]
        );
      }
    }
    
    await conn.commit();
    res.status(201).json({ total_cargo: total });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// DELETE producto (soft)
router.delete('/:id', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    await pool.query('UPDATE productos SET activo = FALSE WHERE id = ? AND cuenta_id = ?', [req.params.id, cuenta_id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
