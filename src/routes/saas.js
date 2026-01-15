const router = require('express').Router();
const pool = require('../config/database');
const crypto = require('crypto');

const generateId = () => crypto.randomUUID();

// 1. PLANES (Funciona según logs)
router.get('/planes', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM planes ORDER BY costo_mensual ASC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. CUENTAS (Daba 404 - Asegúrate que NO diga '/api/saas/cuentas' aquí)
router.get('/cuentas', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM cuentas ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. SUSCRIPCIONES (Daba 404)
router.get('/suscripciones', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                s.*, 
                s.fecha_fin as fecha_vencimiento,
                c.razon_social, 
                h.nombre as hotel_nombre,
                p.nombre as plan_nombre,
                DATEDIFF(s.fecha_fin, NOW()) as dias_restantes
            FROM suscripciones s
            JOIN cuentas c ON s.cuenta_id = c.id
            LEFT JOIN hotel h ON h.cuenta_id = c.id
            JOIN planes p ON s.plan_id = p.id
            ORDER BY s.fecha_fin ASC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. HOTELES ASIGNADOS
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
