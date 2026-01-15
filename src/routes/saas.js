const router = require('express').Router();
const pool = require('../config/database');
const crypto = require('crypto');

const generateId = () => crypto.randomUUID();

// -----------------------------------------------------------
// 1. PLANES (Ajustado a tu esquema real)
// -----------------------------------------------------------

router.get('/planes', async (req, res) => {
    try {
        // Ajustado: costo_mensual en lugar de precio
        const [rows] = await pool.query('SELECT * FROM planes ORDER BY costo_mensual ASC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/planes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Ajustado: quitamos 'meses' y 'descripcion' que no están en tu tabla
        // Usamos los nombres reales: costo_mensual, limite_habitaciones_por_hotel
        const { 
            nombre, 
            costo_mensual, 
            limite_hoteles, 
            limite_habitaciones_por_hotel, 
            activo 
        } = req.body;

        await pool.query(
            `UPDATE planes SET 
                nombre=?, 
                costo_mensual=?, 
                limite_hoteles=?, 
                limite_habitaciones_por_hotel=?, 
                activo=? 
             WHERE id=?`,
            [nombre, costo_mensual, limite_hoteles, limite_habitaciones_por_hotel, activo, id]
        );
        res.json({ message: "Plan actualizado correctamente" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------------
// 2. CUENTAS Y 3. SUSCRIPCIONES (Se mantienen igual)
// -----------------------------------------------------------
// ... (Aquí va el resto de tu código de cuentas y suscripciones)

// -----------------------------------------------------------
// 4. REGISTRAR HOTEL (Ajustado para usar costo_mensual)
// -----------------------------------------------------------
router.post('/registrar-hotel', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const { razon_social, administrador, email, hotel_nombre, plan_id } = req.body;

        const cuentaId = generateId();
        const hotelId = generateId();
        const suscripId = generateId();

        await conn.query(
            'INSERT INTO cuentas (id, razon_social, nombre_administrador, email, activo) VALUES (?, ?, ?, ?, 1)',
            [cuentaId, razon_social, administrador, email]
        );

        await conn.query(
            'INSERT INTO hotel (id, cuenta_id, nombre) VALUES (?, ?, ?)',
            [hotelId, cuentaId, hotel_nombre]
        );

        // Ajuste: Como no tienes 'meses' en la tabla planes, 
        // por defecto daremos 1 mes o puedes añadir la columna después
        await conn.query(
            `INSERT INTO suscripciones (id, cuenta_id, plan_id, fecha_inicio, fecha_fin, estado) 
             VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 MONTH), 'activa')`,
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
