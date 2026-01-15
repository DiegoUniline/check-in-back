require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARES GLOBALES ---
// Ajustamos Helmet para que no sea tan estricto con el Cross-Origin
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

app.use(compression());

// Configuramos CORS específicamente para tu GitHub Pages
app.use(cors({
  origin: [
    'https://diegouniline.github.io', 
    'http://localhost:5173', // Para tus pruebas locales
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-hotel-id'], // Permitimos tu header SaaS
  credentials: true
}));

app.use(express.json());

// --- RUTAS PÚBLICAS (SaaS y Auth) ---
// Estas DEBEN ir antes de cualquier middleware restrictivo
app.use('/api/auth', require('./routes/auth'));
app.use('/api/saas', require('./routes/saas')); // Aquí están los planes

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// --- RUTAS OPERATIVAS ---
// Asegúrate de que dentro de estos archivos (.js) SÍ esté el checkSubscription
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
    message: err.message // Esto te ayudará a ver el error real en la consola del navegador
  });
});

app.listen(PORT, () => {
console.log(`🚀 Server running on port ${PORT}`);
});
