const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const checkSubscription = require('../middleware/checkSubscription');

router.use(checkSubscription);

// Normalización/sanitización de datos de cliente.
// - Qué hace: corrige un bug donde a clientes NO VIP se les terminó guardando un "0" al final del apellido.
// - Por qué: evita que el backend persista valores incorrectos aunque el front tenga un bug o envíe valores inconsistentes.
// - Relación: Consumido por `/api/clientes` desde `Check-In-Front/src/lib/api.ts` y pantallas como `Check-In-Front/src/pages/Clientes.tsx`.
const parseBoolean = (value) => {
  // Acepta boolean, 0/1, "0"/"1", "true"/"false".
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return Boolean(value);
};

const sanitizeApellidoParaNoVip = (apellido, esVip) => {
  // Qué hace: para NO VIP, elimina un sufijo accidental "0" (ej: "Hernández0" -> "Hernández").
  // Por qué: hay registros ya afectados por el bug y se deben limpiar al guardar.
  // Nota: solo aplica cuando el cliente NO es VIP para no tocar casos legítimos.
  if (esVip) return apellido;
  if (apellido === 0) return ''; // caso defensivo: 0 numérico acaba persistiendo como "0" en MySQL (VARCHAR)
  if (typeof apellido !== 'string') return apellido;
  const trimmed = apellido.trim();
  if (trimmed.endsWith('0')) return trimmed.slice(0, -1).trim();
  return trimmed;
};

// Helper para obtener cuenta_id del hotel
const getCuentaId = async (hotel_id) => {
  const [rows] = await pool.query('SELECT cuenta_id FROM hotel WHERE id = ?', [hotel_id]);
  return rows[0]?.cuenta_id;
};

// GET all con búsqueda
router.get('/', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { search, tipo, vip, nivel } = req.query;
    let sql = 'SELECT * FROM clientes WHERE cuenta_id = ? AND activo = TRUE';
    const params = [cuenta_id];
    
    if (search) {
      sql += ' AND (nombre LIKE ? OR apellido_paterno LIKE ? OR email LIKE ? OR telefono LIKE ? OR numero_documento LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }
    if (tipo) { sql += ' AND tipo_cliente = ?'; params.push(tipo); }
    if (vip === 'true') { sql += ' AND es_vip = TRUE'; }
    if (nivel) { sql += ' AND nivel_lealtad = ?'; params.push(nivel); }
    
    sql += ' ORDER BY nombre, apellido_paterno LIMIT 100';
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
    const [rows] = await pool.query('SELECT * FROM clientes WHERE id = ? AND cuenta_id = ?', [req.params.id, cuenta_id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET historial de reservas
router.get('/:id/reservas', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM v_reservas_detalle WHERE cliente_id = ? AND hotel_id = ? ORDER BY fecha_checkin DESC',
      [req.params.id, req.hotel_id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST
router.post('/', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { tipo_cliente, nombre, apellido_paterno, apellido_materno, razon_social, rfc, email, telefono, tipo_documento, numero_documento, nacionalidad, direccion, es_vip, notas } = req.body;
    const esVip = parseBoolean(es_vip);
    const apellidoPaternoSan = sanitizeApellidoParaNoVip(apellido_paterno, esVip);
    const apellidoMaternoSan = sanitizeApellidoParaNoVip(apellido_materno, esVip);
    const id = uuidv4();
    await pool.query(
      `INSERT INTO clientes (id, cuenta_id, tipo_cliente, nombre, apellido_paterno, apellido_materno, razon_social, rfc, email, telefono, tipo_documento, numero_documento, nacionalidad, direccion, es_vip, notas) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        cuenta_id,
        tipo_cliente || 'Persona',
        nombre,
        apellidoPaternoSan,
        apellidoMaternoSan,
        razon_social,
        rfc,
        email,
        telefono,
        tipo_documento || 'INE',
        numero_documento,
        nacionalidad || 'Mexicana',
        direccion,
        esVip,
        notas,
      ]
    );
    // Devolvemos el body ya normalizado para evitar que el front muestre el bug si refresca con esta respuesta.
    res.status(201).json({ id, ...req.body, es_vip: esVip, apellido_paterno: apellidoPaternoSan, apellido_materno: apellidoMaternoSan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT
router.put('/:id', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { tipo_cliente, nombre, apellido_paterno, apellido_materno, razon_social, rfc, email, telefono, tipo_documento, numero_documento, nacionalidad, direccion, es_vip, nivel_lealtad, notas } = req.body;
    const esVip = parseBoolean(es_vip);
    const apellidoPaternoSan = sanitizeApellidoParaNoVip(apellido_paterno, esVip);
    const apellidoMaternoSan = sanitizeApellidoParaNoVip(apellido_materno, esVip);
    await pool.query(
      `UPDATE clientes SET tipo_cliente=?, nombre=?, apellido_paterno=?, apellido_materno=?, razon_social=?, rfc=?, email=?, telefono=?, tipo_documento=?, numero_documento=?, nacionalidad=?, direccion=?, es_vip=?, nivel_lealtad=?, notas=? WHERE id=? AND cuenta_id=?`,
      [
        tipo_cliente,
        nombre,
        apellidoPaternoSan,
        apellidoMaternoSan,
        razon_social,
        rfc,
        email,
        telefono,
        tipo_documento,
        numero_documento,
        nacionalidad,
        direccion,
        esVip,
        nivel_lealtad,
        notas,
        req.params.id,
        cuenta_id,
      ]
    );
    // Igual que en POST, devolvemos valores normalizados para mantener consistencia UI.
    res.json({ id: req.params.id, ...req.body, es_vip: esVip, apellido_paterno: apellidoPaternoSan, apellido_materno: apellidoMaternoSan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE (soft)
router.delete('/:id', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    await pool.query('UPDATE clientes SET activo = FALSE WHERE id = ? AND cuenta_id = ?', [req.params.id, cuenta_id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
