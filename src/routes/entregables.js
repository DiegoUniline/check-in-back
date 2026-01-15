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

// GET todos los entregables activos
router.get('/', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const [rows] = await pool.query('SELECT * FROM entregables WHERE cuenta_id = ? AND activo = 1 ORDER BY nombre', [cuenta_id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear entregable
router.post('/', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { codigo, nombre, descripcion, requiere_devolucion, costo_reposicion } = req.body;
    const id = uuidv4();
    await pool.query(
      'INSERT INTO entregables (id, cuenta_id, codigo, nombre, descripcion, requiere_devolucion, costo_reposicion) VALUES (?,?,?,?,?,?,?)',
      [id, cuenta_id, codigo, nombre, descripcion, requiere_devolucion || 0, costo_reposicion || 0]
    );
    res.status(201).json({ id, codigo, nombre });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT actualizar entregable
router.put('/:id', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { codigo, nombre, descripcion, requiere_devolucion, costo_reposicion, activo } = req.body;
    await pool.query(
      'UPDATE entregables SET codigo=?, nombre=?, descripcion=?, requiere_devolucion=?, costo_reposicion=?, activo=? WHERE id=? AND cuenta_id=?',
      [codigo, nombre, descripcion, requiere_devolucion || 0, costo_reposicion || 0, activo ?? 1, req.params.id, cuenta_id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE entregable (soft)
router.delete('/:id', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    await pool.query('UPDATE entregables SET activo = 0 WHERE id = ? AND cuenta_id = ?', [req.params.id, cuenta_id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET entregables de una reserva
router.get('/reserva/:reservaId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT re.*, e.codigo, e.nombre, e.requiere_devolucion, e.costo_reposicion,
              (re.cantidad - IFNULL(re.cantidad_devuelta, 0)) as faltantes
       FROM reserva_entregables re 
       JOIN entregables e ON re.entregable_id = e.id 
       JOIN reservas r ON re.reserva_id = r.id
       WHERE re.reserva_id = ? AND r.hotel_id = ?
       ORDER BY re.fecha_entrega DESC`,
      [req.params.reservaId, req.hotel_id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST asignar entregable a reserva
router.post('/reserva/:reservaId', async (req, res) => {
  try {
    // Verificar que la reserva pertenece al hotel
    const [reserva] = await pool.query('SELECT id FROM reservas WHERE id = ? AND hotel_id = ?', [req.params.reservaId, req.hotel_id]);
    if (!reserva.length) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }
    
    const { entregable_id, cantidad, notas } = req.body;
    
    const [existing] = await pool.query(
      'SELECT id, cantidad FROM reserva_entregables WHERE reserva_id = ? AND entregable_id = ? AND devuelto = 0',
      [req.params.reservaId, entregable_id]
    );
    
    if (existing.length > 0) {
      const nuevaCantidad = existing[0].cantidad + (cantidad || 1);
      await pool.query(
        'UPDATE reserva_entregables SET cantidad = ? WHERE id = ?',
        [nuevaCantidad, existing[0].id]
      );
      res.json({ id: existing[0].id, cantidad: nuevaCantidad, updated: true });
    } else {
      const id = uuidv4();
      await pool.query(
        'INSERT INTO reserva_entregables (id, reserva_id, entregable_id, cantidad, entregado, fecha_entrega, notas) VALUES (?,?,?,?,1,NOW(),?)',
        [id, req.params.reservaId, entregable_id, cantidad || 1, notas]
      );
      res.status(201).json({ id, cantidad: cantidad || 1 });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH devolver entregable
router.patch('/devolver/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const { cantidad_devuelta, costo_unitario, crear_cargo } = req.body;
    
    const [entregableReserva] = await conn.query(
      `SELECT re.*, e.nombre, e.costo_reposicion, r.id as reserva_id
       FROM reserva_entregables re
       JOIN entregables e ON re.entregable_id = e.id
       JOIN reservas r ON re.reserva_id = r.id
       WHERE re.id = ? AND r.hotel_id = ?`,
      [req.params.id, req.hotel_id]
    );
    
    if (!entregableReserva.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Entregable no encontrado' });
    }
    
    const ent = entregableReserva[0];
    const cantidadEntregada = ent.cantidad || 1;
    const cantidadDevuelta = cantidad_devuelta ?? cantidadEntregada;
    const faltantes = cantidadEntregada - cantidadDevuelta;
    const costoUnitario = costo_unitario ?? ent.costo_reposicion ?? 0;
    
    const devueltoCompleto = faltantes === 0 ? 1 : 0;
    await conn.query(
      `UPDATE reserva_entregables 
       SET cantidad_devuelta = ?, costo_unitario_cobrado = ?, devuelto = ?, fecha_devolucion = NOW() 
       WHERE id = ?`,
      [cantidadDevuelta, faltantes > 0 ? costoUnitario : null, devueltoCompleto, req.params.id]
    );
    
    let cargoCreado = null;
    
    if (faltantes > 0 && crear_cargo !== false && costoUnitario > 0) {
      const cargoId = uuidv4();
      const subtotal = faltantes * costoUnitario;
      const impuesto = subtotal * 0.16;
      const total = subtotal + impuesto;
      
      await conn.query(
        `INSERT INTO cargos_habitacion (id, reserva_id, concepto, cantidad, precio_unitario, subtotal, impuesto, total, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cargoId, ent.reserva_id, `Reposición: ${ent.nombre}`, faltantes, costoUnitario, subtotal, impuesto, total, `No devuelto: ${faltantes} de ${cantidadEntregada}`]
      );
      
      await conn.query(
        'UPDATE reservas SET total = total + ?, saldo_pendiente = saldo_pendiente + ? WHERE id = ? AND hotel_id = ?',
        [total, total, ent.reserva_id, req.hotel_id]
      );
      
      cargoCreado = { id: cargoId, concepto: `Reposición: ${ent.nombre}`, total, faltantes };
    }
    
    await conn.commit();
    
    res.json({ 
      success: true, 
      cantidad_entregada: cantidadEntregada,
      cantidad_devuelta: cantidadDevuelta,
      faltantes,
      devuelto_completo: devueltoCompleto === 1,
      cargo: cargoCreado
    });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// DELETE eliminar entregable de reserva
router.delete('/reserva-entregable/:id', async (req, res) => {
  try {
    const [ent] = await pool.query(
      `SELECT re.* FROM reserva_entregables re
       JOIN reservas r ON re.reserva_id = r.id
       WHERE re.id = ? AND r.hotel_id = ?`,
      [req.params.id, req.hotel_id]
    );
    
    if (!ent.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }
    
    if (ent[0].devuelto) {
      return res.status(400).json({ error: 'No se puede eliminar un entregable ya devuelto' });
    }
    
    await pool.query('DELETE FROM reserva_entregables WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
