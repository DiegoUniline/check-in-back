const router = require('express').Router();
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// GET hotel config
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM hotel LIMIT 1');
    res.json(rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST/PUT hotel config
router.post('/', async (req, res) => {
  try {
    const { nombre, razon_social, rfc, direccion, ciudad, estado, pais, telefono, email, hora_checkin, hora_checkout, estrellas } = req.body;
    const [existing] = await pool.query('SELECT id FROM hotel LIMIT 1');
    
    if (existing.length) {
      await pool.query(
        `UPDATE hotel SET nombre=?, razon_social=?, rfc=?, direccion=?, ciudad=?, estado=?, pais=?, telefono=?, email=?, hora_checkin=?, hora_checkout=?, estrellas=? WHERE id=?`,
        [nombre, razon_social, rfc, direccion, ciudad, estado, pais, telefono, email, hora_checkin, hora_checkout, estrellas, existing[0].id]
      );
      res.json({ id: existing[0].id, ...req.body });
    } else {
      const id = uuidv4();
      await pool.query(
        `INSERT INTO hotel (id, nombre, razon_social, rfc, direccion, ciudad, estado, pais, telefono, email, hora_checkin, hora_checkout, estrellas) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, nombre, razon_social, rfc, direccion, ciudad, estado, pais, telefono, email, hora_checkin, hora_checkout, estrellas]
      );
      res.status(201).json({ id, ...req.body });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
