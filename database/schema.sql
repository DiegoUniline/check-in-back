-- Hotel Haven Database Schema
-- MySQL 8.0+

CREATE DATABASE IF NOT EXISTS hotel_haven;
USE hotel_haven;

-- Configuración del Hotel
CREATE TABLE hotel (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    nombre VARCHAR(100) NOT NULL,
    razon_social VARCHAR(150),
    rfc VARCHAR(13),
    direccion VARCHAR(255),
    ciudad VARCHAR(100),
    estado VARCHAR(100),
    pais VARCHAR(100) DEFAULT 'México',
    telefono VARCHAR(20),
    email VARCHAR(100),
    hora_checkin TIME DEFAULT '15:00:00',
    hora_checkout TIME DEFAULT '12:00:00',
    estrellas TINYINT DEFAULT 3,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tipos de Habitación
CREATE TABLE tipos_habitacion (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    codigo VARCHAR(10) NOT NULL UNIQUE,
    nombre VARCHAR(50) NOT NULL,
    descripcion TEXT,
    capacidad_adultos TINYINT DEFAULT 2,
    capacidad_ninos TINYINT DEFAULT 1,
    capacidad_maxima TINYINT DEFAULT 3,
    precio_base DECIMAL(10,2) NOT NULL,
    precio_persona_extra DECIMAL(10,2) DEFAULT 0,
    amenidades JSON,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Habitaciones
CREATE TABLE habitaciones (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    tipo_id VARCHAR(36) NOT NULL,
    numero VARCHAR(10) NOT NULL UNIQUE,
    piso TINYINT NOT NULL,
    estado_habitacion ENUM('Disponible', 'Ocupada', 'Reservada', 'Bloqueada') DEFAULT 'Disponible',
    estado_limpieza ENUM('Limpia', 'Sucia', 'EnProceso', 'Inspeccion') DEFAULT 'Limpia',
    estado_mantenimiento ENUM('OK', 'Pendiente', 'EnProceso', 'FueraServicio') DEFAULT 'OK',
    notas TEXT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tipo_id) REFERENCES tipos_habitacion(id)
);

-- Clientes
CREATE TABLE clientes (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    tipo_cliente ENUM('Persona', 'Empresa') DEFAULT 'Persona',
    nombre VARCHAR(100) NOT NULL,
    apellido_paterno VARCHAR(100),
    apellido_materno VARCHAR(100),
    razon_social VARCHAR(150),
    rfc VARCHAR(13),
    email VARCHAR(100),
    telefono VARCHAR(20),
    tipo_documento VARCHAR(20) DEFAULT 'INE',
    numero_documento VARCHAR(30),
    nacionalidad VARCHAR(50) DEFAULT 'Mexicana',
    direccion TEXT,
    es_vip BOOLEAN DEFAULT FALSE,
    nivel_lealtad ENUM('Bronce', 'Plata', 'Oro', 'Platino', 'Diamante') DEFAULT 'Bronce',
    total_estancias INT DEFAULT 0,
    notas TEXT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_telefono (telefono),
    INDEX idx_documento (numero_documento)
);

-- Reservas
CREATE TABLE reservas (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    numero_reserva VARCHAR(20) NOT NULL UNIQUE,
    cliente_id VARCHAR(36) NOT NULL,
    habitacion_id VARCHAR(36),
    tipo_habitacion_id VARCHAR(36) NOT NULL,
    fecha_checkin DATE NOT NULL,
    fecha_checkout DATE NOT NULL,
    hora_llegada TIME,
    adultos TINYINT DEFAULT 1,
    ninos TINYINT DEFAULT 0,
    noches INT NOT NULL,
    tarifa_noche DECIMAL(10,2) NOT NULL,
    subtotal_hospedaje DECIMAL(10,2) NOT NULL,
    total_impuestos DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    total_pagado DECIMAL(10,2) DEFAULT 0,
    saldo_pendiente DECIMAL(10,2) NOT NULL,
    estado ENUM('Pendiente', 'Confirmada', 'CheckIn', 'CheckOut', 'Cancelada', 'NoShow') DEFAULT 'Pendiente',
    checkin_realizado BOOLEAN DEFAULT FALSE,
    checkout_realizado BOOLEAN DEFAULT FALSE,
    fecha_checkin_real DATETIME,
    fecha_checkout_real DATETIME,
    solicitudes_especiales TEXT,
    notas_internas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (habitacion_id) REFERENCES habitaciones(id),
    FOREIGN KEY (tipo_habitacion_id) REFERENCES tipos_habitacion(id),
    INDEX idx_numero_reserva (numero_reserva),
    INDEX idx_fecha_checkin (fecha_checkin),
    INDEX idx_fecha_checkout (fecha_checkout),
    INDEX idx_estado (estado)
);

-- Pagos
CREATE TABLE pagos (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    reserva_id VARCHAR(36) NOT NULL,
    numero_pago VARCHAR(20) NOT NULL UNIQUE,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    monto DECIMAL(10,2) NOT NULL,
    metodo_pago ENUM('Efectivo', 'Tarjeta', 'Transferencia', 'Deposito') NOT NULL,
    referencia VARCHAR(100),
    tipo ENUM('Anticipo', 'Abono', 'Liquidacion', 'Reembolso') DEFAULT 'Abono',
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reserva_id) REFERENCES reservas(id),
    INDEX idx_reserva (reserva_id)
);

-- Tareas de Limpieza
CREATE TABLE tareas_limpieza (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    habitacion_id VARCHAR(36) NOT NULL,
    fecha DATE NOT NULL,
    tipo ENUM('Checkout', 'Ocupada', 'Profunda', 'Inspeccion') DEFAULT 'Checkout',
    prioridad ENUM('Baja', 'Normal', 'Alta', 'Urgente') DEFAULT 'Normal',
    estado ENUM('Pendiente', 'EnProceso', 'Completada', 'Verificada') DEFAULT 'Pendiente',
    asignado_a VARCHAR(36),
    asignado_nombre VARCHAR(100),
    hora_inicio DATETIME,
    hora_fin DATETIME,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (habitacion_id) REFERENCES habitaciones(id),
    INDEX idx_fecha (fecha),
    INDEX idx_estado (estado)
);

-- Tareas de Mantenimiento
CREATE TABLE tareas_mantenimiento (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    habitacion_id VARCHAR(36),
    titulo VARCHAR(150) NOT NULL,
    descripcion TEXT,
    tipo ENUM('Correctivo', 'Preventivo', 'Mejora') DEFAULT 'Correctivo',
    prioridad ENUM('Baja', 'Normal', 'Alta', 'Urgente') DEFAULT 'Normal',
    estado ENUM('Pendiente', 'EnProceso', 'Completada', 'Cancelada') DEFAULT 'Pendiente',
    asignado_a VARCHAR(36),
    asignado_nombre VARCHAR(100),
    fecha_reporte DATE NOT NULL,
    fecha_programada DATE,
    fecha_completada DATE,
    costo_estimado DECIMAL(10,2),
    costo_real DECIMAL(10,2),
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (habitacion_id) REFERENCES habitaciones(id)
);

-- Categorías de Productos
CREATE TABLE categorias_producto (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Productos (POS/Inventario)
CREATE TABLE productos (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    categoria_id VARCHAR(36),
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    precio_compra DECIMAL(10,2) DEFAULT 0,
    precio_venta DECIMAL(10,2) NOT NULL,
    stock_actual INT DEFAULT 0,
    stock_minimo INT DEFAULT 5,
    unidad VARCHAR(20) DEFAULT 'PZA',
    imagen VARCHAR(255),
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias_producto(id),
    INDEX idx_codigo (codigo)
);

-- Cargos a Habitación
CREATE TABLE cargos_habitacion (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    reserva_id VARCHAR(36) NOT NULL,
    producto_id VARCHAR(36),
    concepto VARCHAR(150) NOT NULL,
    cantidad DECIMAL(10,2) DEFAULT 1,
    precio_unitario DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    impuesto DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reserva_id) REFERENCES reservas(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- Movimientos de Inventario
CREATE TABLE movimientos_inventario (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    producto_id VARCHAR(36) NOT NULL,
    tipo ENUM('Entrada', 'Salida', 'Ajuste', 'Venta') NOT NULL,
    cantidad INT NOT NULL,
    stock_anterior INT NOT NULL,
    stock_nuevo INT NOT NULL,
    referencia VARCHAR(100),
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- Gastos
CREATE TABLE gastos (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    categoria VARCHAR(50) NOT NULL,
    concepto VARCHAR(150) NOT NULL,
    descripcion TEXT,
    monto DECIMAL(10,2) NOT NULL,
    fecha DATE NOT NULL,
    metodo_pago ENUM('Efectivo', 'Tarjeta', 'Transferencia', 'Cheque') DEFAULT 'Efectivo',
    proveedor VARCHAR(100),
    factura VARCHAR(50),
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fecha (fecha),
    INDEX idx_categoria (categoria)
);

-- Usuarios del Sistema
CREATE TABLE usuarios (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    rol ENUM('Admin', 'Recepcion', 'Housekeeping', 'Mantenimiento', 'Gerente') DEFAULT 'Recepcion',
    activo BOOLEAN DEFAULT TRUE,
    ultimo_login DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Historial de Acciones
CREATE TABLE historial (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    usuario_id VARCHAR(36),
    tabla VARCHAR(50) NOT NULL,
    registro_id VARCHAR(36) NOT NULL,
    accion ENUM('CREATE', 'UPDATE', 'DELETE') NOT NULL,
    datos_anteriores JSON,
    datos_nuevos JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Vistas útiles
CREATE OR REPLACE VIEW v_habitaciones_detalle AS
SELECT 
    h.*,
    t.codigo as tipo_codigo,
    t.nombre as tipo_nombre,
    t.precio_base,
    t.capacidad_maxima,
    t.amenidades
FROM habitaciones h
JOIN tipos_habitacion t ON h.tipo_id = t.id
WHERE h.activo = TRUE;

CREATE OR REPLACE VIEW v_reservas_detalle AS
SELECT 
    r.*,
    c.nombre as cliente_nombre,
    c.apellido_paterno,
    c.apellido_materno,
    c.email as cliente_email,
    c.telefono as cliente_telefono,
    c.es_vip,
    h.numero as habitacion_numero,
    h.piso as habitacion_piso,
    t.nombre as tipo_habitacion_nombre,
    t.codigo as tipo_habitacion_codigo
FROM reservas r
JOIN clientes c ON r.cliente_id = c.id
LEFT JOIN habitaciones h ON r.habitacion_id = h.id
JOIN tipos_habitacion t ON r.tipo_habitacion_id = t.id;

CREATE OR REPLACE VIEW v_dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM habitaciones WHERE estado_habitacion = 'Ocupada' AND activo = TRUE) as ocupadas,
    (SELECT COUNT(*) FROM habitaciones WHERE estado_habitacion = 'Disponible' AND activo = TRUE) as disponibles,
    (SELECT COUNT(*) FROM habitaciones WHERE estado_habitacion = 'Reservada' AND activo = TRUE) as reservadas,
    (SELECT COUNT(*) FROM habitaciones WHERE estado_limpieza != 'Limpia' AND activo = TRUE) as pendientes_limpieza,
    (SELECT COUNT(*) FROM habitaciones WHERE estado_mantenimiento != 'OK' AND activo = TRUE) as pendientes_mantenimiento,
    (SELECT COUNT(*) FROM habitaciones WHERE activo = TRUE) as total_habitaciones;
