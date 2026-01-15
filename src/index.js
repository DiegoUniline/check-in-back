require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const pool = require('./config/database');
const checkSubscription = require('./middleware/checkSubscription'); // Importamos el escudo

const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARES GLOBALES ---
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// --- RUTAS PÚBLICAS Y DE AUTENTICACIÓN ---
// No llevan escudo porque el usuario aún no se ha identificado o son generales
app.use('/api/auth', require('./routes/auth'));
app.use('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// --- RUTAS DE ADMINISTRACIÓN SAAS (Panel de Diego) ---
// Estas rutas NO llevan el middleware checkSubscription porque son para gestionar el SaaS
app.use('/api/saas', require('./routes/saas'));

// ========================================================
// APLICACIÓN DEL ESCUDO SAAS (Middleware)
// A partir de aquí, todas las rutas requerirán x-hotel-id
// ========================================================
// Si prefieres aplicar el escudo aquí globalmente para lo que sigue:
// app.use(checkSubscription); 

// --- RUTAS OPERATIVAS (Protegidas) ---
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
app.use('/api/cargos', require('./routes/cargosHabitacion'));
app.use('/api/conceptos-cargo', require('./routes/conceptos-cargo'));
app.use('/api/entregables', require('./routes/entregables'));

// --- MANEJO DE ERRORES ---
app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err.stack);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined 
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🛡️ SaaS Shield Active`);
});
