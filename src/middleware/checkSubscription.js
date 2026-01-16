const pool = require('../config/database');

const checkSubscription = async (req, res, next) => {
  try {
    const hotel_id = req.headers['x-hotel-id']; 
    if (!hotel_id) {
      return res.status(403).json({ error: "Falta identificación del Hotel (x-hotel-id)" });
    }

    const [rows] = await pool.query(`
      SELECT s.estado, s.fecha_fin, c.activo
      FROM suscripciones s
      JOIN hotel h ON s.hotel_id = h.id
      JOIN cuentas c ON h.cuenta_id = c.id
      WHERE s.hotel_id = ? AND c.activo = 1 AND s.estado = 'activa'
      ORDER BY s.fecha_fin DESC 
      LIMIT 1
    `, [hotel_id]);

    if (rows.length === 0) {
      return res.status(403).json({ 
        error: "Sin suscripción", 
        message: "Este hotel no tiene una suscripción activa.",
        blocked: true
      });
    }

    const suscripcion = rows[0];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaVence = new Date(suscripcion.fecha_fin);
    fechaVence.setHours(23, 59, 59, 999);

    if (fechaVence < hoy) {
      return res.status(403).json({ 
        error: "Suscripción Vencida", 
        message: "Tu suscripción ha vencido. Contacta al 5213171035768 para renovar.",
        vencimiento: suscripcion.fecha_fin,
        blocked: true
      });
    }

    req.hotel_id = hotel_id;
    next();
  } catch (error) {
    console.error('Error checkSubscription:', error);
    res.status(500).json({ error: "Error en validación de suscripción" });
  }
};

module.exports = checkSubscription;
