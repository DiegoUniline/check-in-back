const router = require('express').Router();
const pool = require('../config/database');
const crypto = require('crypto');

const generateId = () => crypto.randomUUID();

// -----------------------------------------------------------
// 1. PLANES (Públicos y Editables)
// -----------------------------------------------------------

// GET Planes - Sin filtros de hotel porque son globales
router.get('/planes', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM planes ORDER BY precio ASC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Editar Plan
router.put('/planes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, precio, meses, limite_habitaciones, activo } = req.body;
        await pool.query(
            'UPDATE planes SET nombre=?, descripcion=?, precio=?, meses=?, limite_habitaciones=?, activo=? WHERE id=?',
            [nombre, descripcion, precio, meses, limite_habitaciones, activo, id]
        );
        res.json({ message: "Plan actualizado correctamente" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------------
// 2. CUENTAS (Los clientes de Diego)
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
// 3. SUSCRIPCIONES (Lógica corregida: Ahora ves el Hotel)
// -----------------------------------------------------------

router.get('/suscripciones', async (req, res) => {
    try {
        const { cuenta_id } = req.query;
        // Agregamos JOIN con tabla HOTEL para saber de quién es cada suscripción
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
// 4. HOTELES Y ASIGNACIONES
// -----------------------------------------------------------

router.get('/hoteles-asignados', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                h.id, 
                h.nombre as hotel_nombre, 
                c.razon_social as dueño,
                c.id as cuenta_id,
                p.nombre as plan_actual,
                s.fecha_fin,
                s.estado as suscripcion_estado
            FROM hotel h
            LEFT JOIN cuentas c ON h.cuenta_id = c.id
            LEFT JOIN suscripciones s ON c.id = s.cuenta_id
            LEFT JOIN planes p ON s.plan_id = p.id
            WHERE (s.estado = 'activa' OR s.estado IS NULL)
            ORDER BY h.nombre ASC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// CREAR NUEVO HOTEL (Operación Maestra SaaS)
// Crea Cuenta -> Crea Hotel -> Crea Suscripción Inicial
router.post('/registrar-hotel', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const { razon_social, administrador, email, hotel_nombre, plan_id } = req.body;

        const cuentaId = generateId();
        const hotelId = generateId();
        const suscripId = generateId();

        // 1. Crear Cuenta
        await conn.query(
            'INSERT INTO cuentas (id, razon_social, nombre_administrador, email, activo) VALUES (?, ?, ?, ?, 1)',
            [cuentaId, razon_social, administrador, email]
        );

        // 2. Crear Hotel vinculado a esa cuenta
        await conn.query(
            'INSERT INTO hotel (id, cuenta_id, nombre) VALUES (?, ?, ?)',
            [hotelId, cuentaId, hotel_nombre]
        );

        // 3. Crear Suscripción inicial basada en el plan elegido
        const [plan] = await conn.query('SELECT meses FROM planes WHERE id = ?', [plan_id]);
        const meses = plan[0]?.meses || 1;
        
        await conn.query(
            `INSERT INTO suscripciones (id, cuenta_id, plan_id, fecha_inicio, fecha_fin, estado) 
             VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MONTH), 'activa')`,
            [suscripId, cuentaId, plan_id, meses]
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
