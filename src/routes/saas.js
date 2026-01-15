const router = require('express').Router();
const pool = require('../config/database');
const crypto = require('crypto');

const generateId = () => crypto.randomUUID();

// -----------------------------------------------------------
// 1. CUENTAS (Búsqueda y Filtro)
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
// 2. PLANES (Ver y Editar)
// -----------------------------------------------------------
router.get('/planes', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM planes ORDER BY precio ASC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/planes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, precio, meses, limite_habitaciones, activo } = req.body;
        await pool.query(
            'UPDATE planes SET nombre=?, descripcion=?, precio=?, meses=?, limite_habitaciones=?, activo=? WHERE id=?',
            [nombre, descripcion, precio, meses, limite_habitaciones, activo, id]
        );
        res.json({ message: "Plan actualizado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------------
// 3. SUSCRIPCIONES (Cálculo de días y Filtros)
// -----------------------------------------------------------
router.get('/suscripciones', async (req, res) => {
    try {
        const { cuenta_id } = req.query;
        let sql = `
            SELECT 
                s.*, 
                s.fecha_fin as fecha_vencimiento, -- Alias para que el Front no de "Invalid Date"
                c.razon_social, 
                p.nombre as plan_nombre,
                DATEDIFF(s.fecha_fin, NOW()) as dias_restantes
            FROM suscripciones s
            JOIN cuentas c ON s.cuenta_id = c.id
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

// Editar suscripción (para renovar o cambiar fechas)
router.put('/suscripciones/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { plan_id, fecha_inicio, fecha_fin, estado } = req.body;
        await pool.query(
            'UPDATE suscripciones SET plan_id=?, fecha_inicio=?, fecha_fin=?, estado=? WHERE id=?',
            [plan_id, fecha_inicio, fecha_fin, estado, id]
        );
        res.json({ message: "Suscripción actualizada" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
