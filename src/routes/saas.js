const router = require('express').Router();
const pool = require('../config/database');
const crypto = require('crypto');

const generateId = () => crypto.randomUUID();

// -----------------------------------------------------------
// 1. PLANES (Ver y Editar)
// -----------------------------------------------------------
router.get('/planes', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM planes ORDER BY costo_mensual ASC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/planes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, costo_mensual, limite_hoteles, limite_habitaciones_por_hotel, activo } = req.body;
        await pool.query(
            `UPDATE planes SET nombre=?, costo_mensual=?, limite_hoteles=?, 
             limite_habitaciones_por_hotel=?, activo=? WHERE id=?`,
            [nombre, costo_mensual, limite_hoteles, limite_habitaciones_por_hotel, activo, id]
        );
        res.json({ message: "Plan actualizado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------------
// 2. CUENTAS (Gestión de Clientes)
// -----------------------------------------------------------
router.get('/cuentas', async (req, res) => {
    try {
        const { busqueda } = req.query;
        let query = 'SELECT * FROM cuentas';
        const params = [];
        if (busqueda) {
            query += ' WHERE razon_social LIKE ? OR nombre_administrador LIKE ?';
            params.push(`%${busqueda}%`, `%${busqueda}%`);
        }
        query += ' ORDER BY created_at DESC';
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------------
// 3. SUSCRIPCIONES (Renovaciones y Control)
// -----------------------------------------------------------
router.get('/suscripciones', async (req, res) => {
    try {
        const { cuenta_id } = req.query;
        let sql = `
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
        `;
        const params = [];
        if (cuenta_id) {
            sql += ' WHERE s.cuenta_id = ?';
            params.push(cuenta_id);
        }
        sql += ' ORDER BY s.fecha_fin ASC';
        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/suscripciones/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { plan_id, fecha_inicio, fecha_fin, estado, total } = req.body;
        await pool.query(
            'UPDATE suscripciones SET plan_id=?, fecha_inicio=?, fecha_fin=?, estado=?, total=? WHERE id=?',
            [plan_id, fecha_inicio, fecha_fin, estado, total || 0, id]
        );
        res.json({ message: "Suscripción actualizada" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------------
// 4. HOTELES (Listado Maestro)
// -----------------------------------------------------------
router.get('/hoteles-asignados', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT h.id, h.nombre as hotel_nombre, c.razon_social as dueño, 
            p.nombre as plan_actual, s.fecha_fin, s.estado as suscripcion_estado
            FROM hotel h
            LEFT JOIN cuentas c ON h.cuenta_id = c.id
            LEFT JOIN suscripciones s ON c.id = s.cuenta_id
            LEFT JOIN planes p ON s.plan_id = p.id
            ORDER BY h.nombre ASC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------------
// 5. REGISTRAR HOTEL (Transacción Maestra)
// -----------------------------------------------------------
router.post('/registrar-hotel', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const { razon_social, administrador, email, hotel_nombre, plan_id } = req.body;

        const cuentaId = generateId();
        const hotelId = generateId();
        const suscripId = generateId();

        // Crear Cuenta
        await conn.query(
            'INSERT INTO cuentas (id, razon_social, nombre_administrador, email, activo) VALUES (?, ?, ?, ?, 1)',
            [cuentaId, razon_social, administrador, email]
        );

        // Crear Hotel
        await conn.query(
            'INSERT INTO hotel (id, cuenta_id, nombre) VALUES (?, ?, ?)',
            [hotelId, cuentaId, hotel_nombre]
        );

        // Crear Suscripción (Default 1 mes)
        await conn.query(
            `INSERT INTO suscripciones (id, cuenta_id, plan_id, fecha_inicio, fecha_fin, estado, total) 
             VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 MONTH), 'activa', 0)`,
            [suscripId, cuentaId, plan_id]
        );

        await conn.commit();
        res.status(201).json({ message: "Hotel registrado con éxito", hotel_id: hotelId });
    } catch (error) {
        await conn.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        conn.release();
    }
});

module.exports = router;
