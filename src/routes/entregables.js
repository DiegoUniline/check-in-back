const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM entregables WHERE activo = 1 ORDER BY nombre');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { codigo, nombre, descripcion, requiere_devolucion, costo_reposicion } = req.body;
    const id = uuidv4();
    await pool.query(
      'INSERT INTO entregables (id, codigo, nombre, descripcion, requiere_devolucion, costo_reposicion) VALUES (?,?,?,?,?,?)',
      [id, codigo, nombre, descripcion, requiere_devolucion || 0, costo_reposicion || 0]
    );
    res.status(201).json({ id, codigo, nombre });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Entregables de una reserva
router.get('/reserva/:reservaId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT re.*, e.codigo, e.nombre, e.requiere_devolucion, e.costo_reposicion 
       FROM reserva_entregables re 
       JOIN entregables e ON re.entregable_id = e.id 
       WHERE re.reserva_id = ?`,
      [req.params.reservaId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Asignar entregable a reserva
router.post('/reserva/:reservaId', async (req, res) => {
  try {
    const { entregable_id, cantidad, notas } = req.body;
    const id = uuidv4();
    await pool.query(
      'INSERT INTO reserva_entregables (id, reserva_id, entregable_id, cantidad, entregado, fecha_entrega, notas) VALUES (?,?,?,?,1,NOW(),?)',
      [id, req.params.reservaId, entregable_id, cantidad || 1, notas]
    );
    res.status(201).json({ id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Marcar como devuelto
router.patch('/devolver/:id', async (req, res) => {
  try {
    await pool.query(
      'UPDATE reserva_entregables SET devuelto = 1, fecha_devolucion = NOW() WHERE id = ?',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
