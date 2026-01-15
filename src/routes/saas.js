const router = require('express').Router();
const pool = require('../config/database');
const crypto = require('crypto');

// Función para generar IDs únicos (UUID)
const generateId = () => crypto.randomUUID();

// ==========================================
// 1. PLANES (Gestión de Costos y Límites)
// ==========================================

// Obtener todos los planes
router.get('/planes', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM planes ORDER BY costo_mensual ASC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Crear un nuevo plan
router.post('/planes', async (req, res) => {
    const { nombre, costo_mensual, limite_hoteles, limite_habitaciones_por_hotel } = req.body;
    try {
        const id = generateId();
        await pool.query(
            'INSERT INTO planes (id, nombre, costo_mensual, limite_hoteles, limite_habitaciones_por_hotel) VALUES (?, ?, ?, ?, ?)',
            [id, nombre, costo_mensual, limite_hoteles, limite_habitaciones_por_hotel]
        );
        res.status(201).json({ id, message: "Plan creado con éxito" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Editar un plan existente
router.put('/planes/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, costo_mensual, limite_hoteles, limite_habitaciones_por_hotel } = req.body;
    try {
        await pool.query(
            'UPDATE planes SET nombre = ?, costo_mensual = ?, limite_hoteles = ?, limite_habitaciones_por_hotel = ? WHERE id = ?',
            [nombre, costo_mensual, limite_hoteles, limite_habitaciones_por_hotel, id]
        );
        res.json({ message: "Plan actualizado correctamente" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 2. CUENTAS (Gestión de Clientes/Dueños)
// ==========================================

// Obtener todas las cuentas con su contador de hoteles
router.get('/cuentas', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT c.*, 
            (SELECT COUNT(*) FROM hotel h WHERE h.cuenta_id = c.id) as total_hoteles 
            FROM cuentas c 
            ORDER BY created_at DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Crear cliente nuevo
router.post('/cuentas', async (req, res) => {
    const { razon_social, email, password } = req.body;
    try {
        const id = generateId();
        // Nota: En un entorno real, usa bcrypt para la contraseña
        await pool.query(
            'INSERT INTO cuentas (id, razon_social, email, password, activo) VALUES (?, ?, ?, ?, 1)',
            [id, razon_social, email, password]
        );
        res.status(201).json({ id, message: "Cliente creado correctamente" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Eliminar un cliente
router.delete('/cuentas/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM cuentas WHERE id = ?', [req.params.id]);
        res.json({ message: "Cliente eliminado del sistema" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 3. SUSCRIPCIONES (Control de Pagos y Acceso)
// ==========================================

// Listado global de suscripciones para el Dashboard
router.get('/suscripciones', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                s.*, 
                s.fecha_fin as fecha_vencimiento,
                c.razon_social as cuenta_nombre, 
                h.nombre as hotel_nombre,
                p.nombre as plan_nombre,
                DATEDIFF(s.fecha_fin, NOW()) as dias_restantes
            FROM suscripciones s
            JOIN cuentas c ON s.cuenta_id = c.id
            LEFT JOIN hotel h ON h.cuenta_id = c.id
            LEFT JOIN planes p ON s.plan_id = p.id
            ORDER BY s.fecha_fin ASC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Extender suscripción (+30 días o personalizados)
router.post('/suscripciones/:id/extender', async (req, res) => {
    const { id } = req.params;
    const { dias = 30 } = req.body;
    try {
        // Lógica inteligente: Si ya venció, suma desde hoy. Si no, suma desde la fecha de vencimiento actual.
        await pool.query(`
            UPDATE suscripciones 
            SET fecha_fin = DATE_ADD(GREATEST(fecha_fin, NOW()), INTERVAL ? DAY),
                estado = 'activa'
            WHERE id = ?
        `, [dias, id]);
        res.json({ message: "Suscripción extendida con éxito" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Asignar plan manualmente a un hotel
router.post('/suscripciones/asignar', async (req, res) => {
    const { cuenta_id, plan_id, hotel_id } = req.body;
    try {
        const id = generateId();
        await pool.query(`
            INSERT INTO suscripciones (id, cuenta_id, plan_id, hotel_id, fecha_inicio, fecha_fin, estado)
            VALUES (?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), 'activa')
        `, [id, cuenta_id, plan_id, hotel_id]);
        res.json({ message: "Plan asignado al hotel correctamente" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cancelar/Eliminar suscripción
router.delete('/suscripciones/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM suscripciones WHERE id = ?', [req.params.id]);
        res.json({ message: "Suscripción cancelada" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 4. HOTELES (Vista Relacional Detallada)
// ==========================================

router.get('/hoteles-asignados', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT h.id, h.nombre as hotel_nombre, c.razon_social as dueño, 
            p.nombre as plan_actual, s.fecha_fin, s.estado as suscripcion_estado
            FROM hotel h
            LEFT JOIN cuentas c ON h.cuenta_id = c.id
            LEFT JOIN suscripciones s ON c.id = s.cuenta_id
            LEFT JOIN planes p ON s.plan_id = p.id
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Obtener todos los hoteles
router.get('/hoteles', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM hotel ORDER BY nombre');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear hotel
router.post('/hoteles', async (req, res) => {
  const { cuenta_id, nombre, ciudad, telefono } = req.body;
  try {
    const id = generateId();
    await pool.query(
      'INSERT INTO hotel (id, cuenta_id, nombre, ciudad, telefono) VALUES (?, ?, ?, ?, ?)',
      [id, cuenta_id, nombre, ciudad, telefono]
    );
    res.status(201).json({ id, cuenta_id, nombre, ciudad, telefono });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear suscripción con días personalizados
router.post('/suscripciones', async (req, res) => {
  const { cuenta_id, hotel_id, plan_id, dias = 30 } = req.body;
  try {
    const id = generateId();
    await pool.query(`
      INSERT INTO suscripciones (id, cuenta_id, hotel_id, plan_id, fecha_inicio, fecha_fin, estado)
      VALUES (?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), 'activa')
    `, [id, cuenta_id, hotel_id, plan_id, dias]);
    res.status(201).json({ id, message: "Suscripción creada" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
