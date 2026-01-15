const pool = require('../config/database');

const checkSubscription = async (req, res, next) => {
    try {
        // El Frontend debe enviar el ID del hotel en este Header
        const hotel_id = req.headers['x-hotel-id']; 

        if (!hotel_id) {
            return res.status(403).json({ error: "Falta identificación del Hotel (x-hotel-id)" });
        }

        // Consultamos la cuenta y suscripción vinculada a ese hotel
        const [rows] = await pool.query(`
            SELECT s.estado, s.fecha_fin, c.activo
            FROM hotel h
            JOIN cuentas c ON h.cuenta_id = c.id
            JOIN suscripciones s ON c.id = s.cuenta_id
            WHERE h.id = ? AND c.activo = 1
            ORDER BY s.fecha_fin DESC LIMIT 1
        `, [hotel_id]);

        if (rows.length === 0) {
            return res.status(403).json({ error: "Este hotel no tiene un plan activo con Global Acceso." });
        }

        const suscripcion = rows[0];
        const hoy = new Date();
        const fechaVence = new Date(suscripcion.fecha_fin);

        // Bloqueo si la fecha ya pasó o el estado no es 'activa'
        if (suscripcion.estado !== 'activa' || fechaVence < hoy) {
            return res.status(403).json({ 
                error: "Suscripción Vencida", 
                message: "Acceso bloqueado. Por favor, regularice su pago en el panel de Diego.",
                vencimiento: suscripcion.fecha_fin
            });
        }

        // Si todo está OK, guardamos el hotel_id en la petición para usarlo en los controladores
        req.hotel_id = hotel_id;
        next();
    } catch (error) {
        res.status(500).json({ error: "Error en validación de seguridad SaaS" });
    }
};

module.exports = checkSubscription;
