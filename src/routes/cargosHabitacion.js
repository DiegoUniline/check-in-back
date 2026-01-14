const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// GET por reserva
router.get('/reserva/:reserva_id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ch.*, p.nombre as producto_nombre, cc.nombre as concepto_nombre, cc.categoria
       FROM cargos_habitacion ch 
       LEFT JOIN productos p ON ch.producto_id = p.id
       LEFT JOIN conceptos_cargo cc ON ch.concepto_id = cc.id
       WHERE ch.reserva_id = ? ORDER BY ch.created_at DESC`,
      [req.params.reserva_id]
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
       WHERE r.habitacion_id = ? AND r.estado = 'CheckIn'
       LIMIT 1`,
      [req.params.habitacion_id]
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
    
    // Si no viene reserva_id pero sí habitacion_id, buscar la reserva activa
    if (!reserva_id && habitacion_id) {
      const [reservaActiva] = await conn.query(
        `SELECT id FROM reservas WHERE habitacion_id = ? AND estado = 'CheckIn' LIMIT 1`,
        [habitacion_id]
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
    
    const id = uuidv4();
    
    // Si viene concepto_id, obtener info del concepto
    let conceptoNombre = concepto || 'Cargo adicional';
    let aplicaIva = true;
    
    if (concepto_id) {
      const [conceptoData] = await conn.query('SELECT nombre, aplica_iva FROM conceptos_cargo WHERE id = ?', [concepto_id]);
      if (conceptoData.length) {
        conceptoNombre = conceptoData[0].nombre;
        aplicaIva = conceptoData[0].aplica_iva;
      }
    }
    
    // Calcular valores
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
    
    // Actualizar saldo de la reserva
    await conn.query(
      `UPDATE reservas SET total = total + ?, saldo_pendiente = saldo_pendiente + ? WHERE id = ?`,
      [tot, tot, reserva_id]
    );
    
    // Descontar stock si es producto
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
    console.error('Error cargo:', error);
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
    
    const [cargo] = await conn.query('SELECT * FROM cargos_habitacion WHERE id = ?', [req.params.id]);
    if (!cargo.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'No encontrado' });
    }
    
    // Revertir saldo de reserva
    await conn.query(
      `UPDATE reservas SET total = total - ?, saldo_pendiente = saldo_pendiente - ? WHERE id = ?`,
      [cargo[0].total, cargo[0].total, cargo[0].reserva_id]
    );
    
    // Regresar stock si era producto
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
