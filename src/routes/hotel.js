const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const checkSubscription = require('../middleware/checkSubscription');

router.use(checkSubscription);

// GET hotel config
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM hotel WHERE id = ?', [req.hotel_id]);
    res.json(rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST/PUT hotel config
router.post('/', async (req, res) => {
  try {
    const { nombre, razon_social, rfc, direccion, ciudad, estado, pais, telefono, email, hora_checkin, hora_checkout, estrellas } = req.body;
    
    const [existing] = await pool.query('SELECT id FROM hotel WHERE id = ?', [req.hotel_id]);
    
    if (existing.length) {
      await pool.query(
        `UPDATE hotel SET nombre=?, razon_social=?, rfc=?, direccion=?, ciudad=?, estado=?, pais=?, telefono=?, email=?, hora_checkin=?, hora_checkout=?, estrellas=? WHERE id=?`,
        [nombre, razon_social, rfc, direccion, ciudad, estado, pais, telefono, email, hora_checkin, hora_checkout, estrellas, req.hotel_id]
      );
      res.json({ id: req.hotel_id, ...req.body });
    } else {
      res.status(404).json({ error: 'Hotel no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
