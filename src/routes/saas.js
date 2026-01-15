const router = require('express').Router();
const pool = require('../config/database');
const crypto = require('crypto');

// Función para generar IDs únicos si no usas AUTO_INCREMENT
const generateId = () => crypto.randomUUID();

// ==========================================
// 1. PLANES (Ver, Crear, Editar)
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
        res.status(201).json({ id, message: "Plan creado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Editar un plan
router.put('/planes/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, costo_mensual, limite_hoteles, limite_habitaciones_por_hotel } = req.body;
    try {
        await pool.query(
            'UPDATE planes SET nombre = ?, costo_mensual = ?, limite_hoteles = ?, limite_habitaciones_por_hotel = ? WHERE id = ?',
            [nombre, costo_mensual, limite_hoteles, limite_habitaciones_por_hotel, id]
        );
        res.json({ message: "Plan actualizado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 2. CUENTAS (Clientes)
// ==========================================

// Obtener cuentas
router.get('/cuentas', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT c.*, (SELECT COUNT(*) FROM hotel h WHERE h.cuenta_id = c.id) as total_hoteles 
            FROM cuentas c 
            ORDER BY created_at DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Crear cuenta nueva (Botón NUEVO CLIENTE)
router.post('/cuentas', async (req, res) => {
    const { razon_social, email, password } = req.body;
    try {
        const id = generateId();
        await pool.query(
            'INSERT INTO cuentas (id, razon_social, email, password, activo) VALUES (?, ?, ?, ?, 1)',
            [id, razon_social, email, password] // Aquí podrías encriptar el pass si quieres
        );
        res.status(201).json({ id, message: "Cliente creado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Eliminar cuenta
router.delete('/cuentas/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM cuentas WHERE id = ?', [req.params.id]);
        res.json({ message: "Cliente eliminado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 3. SUSCRIPCIONES (Acceso a Hoteles)
// ==========================================

// Obtener todas las suscripciones detalladas
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

// Extender suscripción (+30 días)
router.post('/suscripciones/:id/extender', async (req, res) => {
    const { id } = req.params;
    const { dias = 30 } = req.body;
    try {
        // SQL: Si ya venció, suma desde hoy. Si no, suma desde la fecha fin.
        await pool.query(`
            UPDATE suscripciones 
            SET fecha_fin = DATE_ADD(GREATEST(fecha_fin, NOW()), INTERVAL ? DAY),
                estado = 'activa'
            WHERE id = ?
        `, [dias, id]);
        res.json({ message: "Días agregados con éxito" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Eliminar suscripción (Cortar acceso)
router.delete('/suscripciones/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM suscripciones WHERE id = ?', [req.params.id]);
        res.json({ message: "Suscripción eliminada" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 4. HOTELES (Vista Relacional)
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

module.exports = router;
