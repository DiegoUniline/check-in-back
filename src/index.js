require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const pool = require('./config/database');
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/hotel', require('./routes/hotel'));
app.use('/api/tipos-habitacion', require('./routes/tiposHabitacion'));
app.use('/api/habitaciones', require('./routes/habitaciones'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/reservas', require('./routes/reservas'));
app.use('/api/pagos', require('./routes/pagos'));
app.use('/api/limpieza', require('./routes/limpieza'));
app.use('/api/mantenimiento', require('./routes/mantenimiento'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/gastos', require('./routes/gastos'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/compras', require('./routes/compras'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/ventas', require('./routes/ventas'));
app.use('/api/cargos-habitacion', require('./routes/cargosHabitacion'));
app.use('/api/conceptos-cargo', require('./routes/conceptos-cargo'));
app.use('/api/entregables', require('./routes/entregables'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
