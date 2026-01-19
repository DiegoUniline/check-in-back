const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const checkSubscription = require('../middleware/checkSubscription');

router.use(checkSubscription);

// GET todas
router.get('/', async (req, res) => {
  try {
    const { proveedor_id, fecha_desde, fecha_hasta } = req.query;
    let sql = `
      SELECT c.*, p.nombre as proveedor_nombre,
      (SELECT COUNT(*) FROM compras_detalle WHERE compra_id = c.id) as items_count
      FROM compras c
      LEFT JOIN proveedores p ON c.proveedor_id = p.id
      WHERE c.hotel_id = ?
    `;
    const params = [req.hotel_id];
    
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
      `SELECT c.*, p.nombre as proveedor_nombre FROM compras c LEFT JOIN proveedores p ON c.proveedor_id = p.id WHERE c.id = ? AND c.hotel_id = ?`,
      [req.params.id, req.hotel_id]
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
    
    console.log('=== COMPRA BODY ===', JSON.stringify(req.body, null, 2));
    
    const { proveedor_id, fecha, folio_factura, subtotal, impuestos, total, notas, detalle } = req.body;
    const id = uuidv4();
    
    // Insertar encabezado
    await conn.query(
      `INSERT INTO compras (id, hotel_id, proveedor_id, fecha, folio_factura, subtotal, impuestos, total, notas) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, req.hotel_id, proveedor_id, fecha || new Date(), folio_factura || null, subtotal || 0, impuestos || 0, total || 0, notas || null]
    );
    
    console.log('=== COMPRA CREADA ===', id);
    
    // Insertar detalle
    if (detalle && Array.isArray(detalle) && detalle.length > 0) {
      console.log('=== DETALLE RECIBIDO ===', detalle.length, 'items');
      
      for (const item of detalle) {
        const detalleId = uuidv4();
        const productoId = item.producto_id || null;
        const cantidad = parseFloat(item.cantidad) || 0;
        const precioUnitario = parseFloat(item.precio_unitario) || 0;
        const subtotalItem = cantidad * precioUnitario;
        
        console.log('=== INSERTANDO DETALLE ===', { detalleId, productoId, cantidad, precioUnitario });
        
        await conn.query(
          `INSERT INTO compras_detalle (id, compra_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?,?)`,
          [detalleId, id, productoId, cantidad, precioUnitario, subtotalItem]
        );
        
        // Actualizar stock solo si hay producto_id válido
        if (productoId) {
          const [prod] = await conn.query('SELECT stock_actual FROM productos WHERE id = ? AND hotel_id = ?', [productoId, req.hotel_id]);
          if (prod.length) {
            const stockAnterior = parseFloat(prod[0].stock_actual) || 0;
            const stockNuevo = stockAnterior + cantidad;
            
            await conn.query('UPDATE productos SET stock_actual = ?, precio_compra = ? WHERE id = ?', 
              [stockNuevo, precioUnitario, productoId]);
            
            await conn.query(
              `INSERT INTO movimientos_inventario (id, hotel_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia) VALUES (?,?,?,'Entrada',?,?,?,?)`,
              [uuidv4(), req.hotel_id, productoId, cantidad, stockAnterior, stockNuevo, `Compra ${folio_factura || id}`]
            );
            
            console.log('=== STOCK ACTUALIZADO ===', productoId, stockAnterior, '->', stockNuevo);
          }
        }
      }
    } else {
      console.log('=== SIN DETALLE ===');
    }
    
    await conn.commit();
    console.log('=== COMMIT OK ===');
    
    res.status(201).json({ id, ...req.body });
  } catch (error) {
    await conn.rollback();
    console.error('=== ERROR COMPRA ===', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM compras_detalle WHERE compra_id = ?', [req.params.id]);
    await pool.query('DELETE FROM compras WHERE id = ? AND hotel_id = ?', [req.params.id, req.hotel_id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
