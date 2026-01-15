const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const checkSubscription = require('../middleware/checkSubscription');

router.use(checkSubscription);

// GET por reserva
router.get('/reserva/:reserva_id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ch.*, p.nombre as producto_nombre, cc.nombre as concepto_nombre, cc.categoria
       FROM cargos_habitacion ch 
       JOIN reservas r ON ch.reserva_id = r.id
       LEFT JOIN productos p ON ch.producto_id = p.id
       LEFT JOIN conceptos_cargo cc ON ch.concepto_id = cc.id
       WHERE ch.reserva_id = ? AND r.hotel_id = ?
       ORDER BY ch.created_at DESC`,
      [req.params.reserva_id, req.hotel_id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET reserva activa por habitación
router.get('/habitacion/:habitacion_id/reserva-activa', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.numero_reserva, r.cliente_id, c.nombre as cliente_nombre, c.apellido_paterno
       FROM reservas r 
       LEFT JOIN clientes c ON r.cliente_id = c.id
       WHERE r.habitacion_id = ? AND r.hotel_id = ? AND r.estado = 'CheckIn'
       LIMIT 1`,
      [req.params.habitacion_id, req.hotel_id]
    );
    
    if (!rows.length) {
      return res.status(404).json({ error: 'No hay reserva activa en esta habitación' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST cargo
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    let { reserva_id, habitacion_id, producto_id, concepto_id, concepto, cantidad, precio_unitario, subtotal, impuesto, total, notas } = req.body;
    
    if (!reserva_id && habitacion_id) {
      const [reservaActiva] = await conn.query(
        `SELECT id FROM reservas WHERE habitacion_id = ? AND hotel_id = ? AND estado = 'CheckIn' LIMIT 1`,
        [habitacion_id, req.hotel_id]
      );
      
      if (!reservaActiva.length) {
        await conn.rollback();
        return res.status(400).json({ error: 'No hay reserva activa en esta habitación' });
      }
      
      reserva_id = reservaActiva[0].id;
    }
    
    if (!reserva_id) {
      await conn.rollback();
      return res.status(400).json({ error: 'Se requiere reserva_id o habitacion_id' });
    }
    
    // Verificar que la reserva pertenece al hotel
    const [reservaCheck] = await conn.query('SELECT id FROM reservas WHERE id = ? AND hotel_id = ?', [reserva_id, req.hotel_id]);
    if (!reservaCheck.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }
    
    const id = uuidv4();
    
    let conceptoNombre = concepto || 'Cargo adicional';
    let aplicaIva = true;
    
    if (concepto_id) {
      const [conceptoData] = await conn.query('SELECT nombre, aplica_iva FROM conceptos_cargo WHERE id = ?', [concepto_id]);
      if (conceptoData.length) {
        conceptoNombre = conceptoData[0].nombre;
        aplicaIva = conceptoData[0].aplica_iva;
      }
    }
    
    const cant = parseFloat(cantidad) || 1;
    const precio = parseFloat(precio_unitario) || 0;
    const sub = subtotal ? parseFloat(subtotal) : (cant * precio);
    const imp = impuesto !== undefined ? parseFloat(impuesto) : (aplicaIva ? sub * 0.16 : 0);
    const tot = total ? parseFloat(total) : (sub + imp);
    
    await conn.query(
      `INSERT INTO cargos_habitacion (id, reserva_id, concepto_id, producto_id, concepto, cantidad, precio_unitario, subtotal, impuesto, total, notas) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, reserva_id, concepto_id || null, producto_id || null, conceptoNombre, cant, precio, sub, imp, tot, notas || null]
    );
    
    await conn.query(
      `UPDATE reservas SET total = total + ?, saldo_pendiente = saldo_pendiente + ? WHERE id = ? AND hotel_id = ?`,
      [tot, tot, reserva_id, req.hotel_id]
    );
    
    if (producto_id) {
      const [prod] = await conn.query('SELECT stock_actual FROM productos WHERE id = ?', [producto_id]);
      if (prod.length && prod[0].stock_actual >= cant) {
        await conn.query('UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?', [cant, producto_id]);
      }
    }
    
    await conn.commit();
    res.status(201).json({ id, reserva_id, concepto: conceptoNombre, total: tot });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// DELETE cargo
router.delete('/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const [cargo] = await conn.query(
      `SELECT ch.* FROM cargos_habitacion ch
       JOIN reservas r ON ch.reserva_id = r.id
       WHERE ch.id = ? AND r.hotel_id = ?`,
      [req.params.id, req.hotel_id]
    );
    
    if (!cargo.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'No encontrado' });
    }
    
    await conn.query(
      `UPDATE reservas SET total = total - ?, saldo_pendiente = saldo_pendiente - ? WHERE id = ? AND hotel_id = ?`,
      [cargo[0].total, cargo[0].total, cargo[0].reserva_id, req.hotel_id]
    );
    
    if (cargo[0].producto_id) {
      await conn.query(
        'UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?', 
        [cargo[0].cantidad, cargo[0].producto_id]
      );
    }
    
    await conn.query('DELETE FROM cargos_habitacion WHERE id = ?', [req.params.id]);
    
    await conn.commit();
    res.json({ success: true });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
