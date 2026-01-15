const pool = require('../config/database');

const checkSubscription = async (req, res, next) => {
    try {
        // Obtenemos el hotel_id desde el token o la query (ajusta según tu login)
        const hotel_id = req.headers['hotel-id'] || req.query.hotel_id;

        if (!hotel_id) {
            return res.status(400).json({ error: "ID de hotel no proporcionado" });
        }

        const [rows] = await pool.query(`
            SELECT s.estado, s.fecha_fin 
            FROM hotel h
            JOIN suscripciones s ON h.cuenta_id = s.cuenta_id
            WHERE h.id = ? AND s.estado = 'activa' AND s.fecha_fin >= NOW()
        `, [hotel_id]);

        if (rows.length === 0) {
            return res.status(403).json({ 
                error: "Suscripción vencida o inexistente",
                blocked: true,
                message: "Acceso denegado. Contacte al administrador para renovar su plan."
            });
        }

        next(); // Si todo está bien, permite continuar a la ruta
    } catch (error) {
        res.status(500).json({ error: "Error verificando suscripción" });
    }
};

module.exports = checkSubscription;
