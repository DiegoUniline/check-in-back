const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// GET todas
router.get('/', async (req, res) => {
  try {
    const { proveedor_id, fecha_desde, fecha_hasta } = req.query;
    let sql = `
      SELECT c.*, p.nombre as proveedor_nombre
      FROM compras c
      LEFT JOIN proveedores p ON c.proveedor_id = p.id
      WHERE 1=1
    `;
    const params = [];
    
    if (proveedor_id) { sql += ' AND c.proveedor_id = ?'; params.push(proveedor_id); }
    if (fecha_desde) { sql += ' AND c.fecha >= ?'; params.push(fecha_desde); }
    if (fecha_hasta) { sql += ' AND c.fecha <= ?'; params.push(fecha_hasta); }
    
    sql += ' ORDER BY c.fecha DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET una con detalle
router.get('/:id', async (req, res) => {
  try {
    const [compra] = await pool.query(
      `SELECT c.*, p.nombre as proveedor_nombre FROM compras c LEFT JOIN proveedores p ON c.proveedor_id = p.id WHERE c.id = ?`,
      [req.params.id]
    );
    if (!compra.length) return res.status(404).json({ error: 'No encontrado' });
    
    const [detalle] = await pool.query(
      `SELECT cd.*, pr.nombre as producto_nombre FROM compras_detalle cd LEFT JOIN productos pr ON cd.producto_id = pr.id WHERE cd.compra_id = ?`,
      [req.params.id]
    );
    
    res.json({ ...compra[0], detalle });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST compra con detalle
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const { proveedor_id, fecha, folio_factura, subtotal, impuestos, total, notas, detalle } = req.body;
    const id = uuidv4();
    
    await conn.query(
      `INSERT INTO compras (id, proveedor_id, fecha, folio_factura, subtotal, impuestos, total, notas) VALUES (?,?,?,?,?,?,?,?)`,
      [id, proveedor_id, fecha || new Date(), folio_factura, subtotal, impuestos, total, notas]
    );
    
    if (detalle && detalle.length > 0) {
      for (const item of detalle) {
        await conn.query(
          `INSERT INTO compras_detalle (id, compra_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?,?)`,
          [uuidv4(), id, item.producto_id, item.cantidad, item.precio_unitario, item.cantidad * item.precio_unitario]
        );
        
        const [prod] = await conn.query('SELECT stock_actual FROM productos WHERE id = ?', [item.producto_id]);
        if (prod.length) {
          const stockAnterior = prod[0].stock_actual;
          const stockNuevo = stockAnterior + item.cantidad;
          
          await conn.query('UPDATE productos SET stock_actual = ?, precio_compra = ? WHERE id = ?', 
            [stockNuevo, item.precio_unitario, item.producto_id]);
          
          await conn.query(
            `INSERT INTO movimientos_inventario (id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia) VALUES (?,?,'Entrada',?,?,?,?)`,
            [uuidv4(), item.producto_id, item.cantidad, stockAnterior, stockNuevo, `Compra ${folio_factura || id}`]
          );
        }
      }
    }
    
    await conn.commit();
    res.status(201).json({ id, ...req.body });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM compras_detalle WHERE compra_id = ?', [req.params.id]);
    await pool.query('DELETE FROM compras WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
