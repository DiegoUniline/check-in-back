const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const checkSubscription = require('../middleware/checkSubscription');

router.use(checkSubscription);

/*
  Sanitización defensiva de strings de nombre:
  - Relacionado con `Check-In-Front/src/pages/Clientes.tsx` (listado y formulario).
  - Reporte: algunos clientes aparecen con un "0" al final (ej: "García0") y vuelve a aparecer tras guardar.
  - Este backend sanea tanto entrada (POST/PUT) como salida (GET) para cortar el problema aunque la BD/SQL-mode
    o datos legacy estén metiendo ese sufijo.
*/
const cleanNamePart = (v) => {
  let s = String(v ?? '').trim();
  if (!s) return '';
  try {
    // Normalizamos para unificar dígitos "raros" (fullwidth, etc.) a ASCII.
    s = s.normalize('NFKC');
  } catch {
    // En Node moderno existe; si no, continuamos sin normalizar.
  }
  if (s === '0') return '';
  // Recorta un '0' final cuando está pegado a una letra (con marcas combinantes opcionales).
  return s.replace(/([\p{L}][\p{M}]*)0$/u, '$1').trim();
};

const sanitizeCliente = (row) => {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    nombre: cleanNamePart(row.nombre),
    apellido_paterno: cleanNamePart(row.apellido_paterno),
    apellido_materno: cleanNamePart(row.apellido_materno),
    razon_social: cleanNamePart(row.razon_social),
  };
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
    // Sanitizamos salida para evitar mostrar sufijos "0" en nombres/apellidos.
    res.json(rows.map(sanitizeCliente));
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
    res.json(sanitizeCliente(rows[0]));
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
    const id = uuidv4();

    // Sanitizamos entrada: evita persistir "0" al final por datos legacy o conversiones raras.
    const nombreSafe = cleanNamePart(nombre);
    const apellidoPaternoSafe = cleanNamePart(apellido_paterno);
    const apellidoMaternoSafe = cleanNamePart(apellido_materno);
    const razonSocialSafe = cleanNamePart(razon_social);

    await pool.query(
      `INSERT INTO clientes (id, cuenta_id, tipo_cliente, nombre, apellido_paterno, apellido_materno, razon_social, rfc, email, telefono, tipo_documento, numero_documento, nacionalidad, direccion, es_vip, notas) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, cuenta_id, tipo_cliente || 'Persona', nombreSafe, apellidoPaternoSafe, apellidoMaternoSafe, razonSocialSafe, rfc, email, telefono, tipo_documento || 'INE', numero_documento, nacionalidad || 'Mexicana', direccion, es_vip || false, notas]
    );
    res.status(201).json(sanitizeCliente({ id, ...req.body, nombre: nombreSafe, apellido_paterno: apellidoPaternoSafe, apellido_materno: apellidoMaternoSafe, razon_social: razonSocialSafe }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT
router.put('/:id', async (req, res) => {
  try {
    const cuenta_id = await getCuentaId(req.hotel_id);
    const { tipo_cliente, nombre, apellido_paterno, apellido_materno, razon_social, rfc, email, telefono, tipo_documento, numero_documento, nacionalidad, direccion, es_vip, nivel_lealtad, notas } = req.body;

    // Sanitizamos entrada para evitar que el "0" se siga reinsertando al editar/guardar.
    const nombreSafe = cleanNamePart(nombre);
    const apellidoPaternoSafe = cleanNamePart(apellido_paterno);
    const apellidoMaternoSafe = cleanNamePart(apellido_materno);
    const razonSocialSafe = cleanNamePart(razon_social);

    await pool.query(
      `UPDATE clientes SET tipo_cliente=?, nombre=?, apellido_paterno=?, apellido_materno=?, razon_social=?, rfc=?, email=?, telefono=?, tipo_documento=?, numero_documento=?, nacionalidad=?, direccion=?, es_vip=?, nivel_lealtad=?, notas=? WHERE id=? AND cuenta_id=?`,
      [tipo_cliente, nombreSafe, apellidoPaternoSafe, apellidoMaternoSafe, razonSocialSafe, rfc, email, telefono, tipo_documento, numero_documento, nacionalidad, direccion, es_vip, nivel_lealtad, notas, req.params.id, cuenta_id]
    );
    res.json(sanitizeCliente({ id: req.params.id, ...req.body, nombre: nombreSafe, apellido_paterno: apellidoPaternoSafe, apellido_materno: apellidoMaternoSafe, razon_social: razonSocialSafe }));
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
