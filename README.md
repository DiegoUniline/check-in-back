# Actualización Backend Hotel

## Archivos incluidos:

```
backend-update/
├── src/
│   ├── index.js              → Reemplaza tu archivo principal
│   └── routes/
│       ├── proveedores.js    → NUEVO - Crear este archivo
│       ├── compras.js        → NUEVO - Crear este archivo
│       └── usuarios.js       → NUEVO - Crear este archivo
├── EJECUTAR_EN_PHPMYADMIN.sql → SQL para crear tablas
└── README.md                  → Este archivo
```

## Pasos de instalación:

### 1. Base de datos
- Abre phpMyAdmin
- Selecciona tu base de datos
- Ve a la pestaña "SQL"
- Copia y pega el contenido de `EJECUTAR_EN_PHPMYADMIN.sql`
- Ejecuta

### 2. Backend
- Copia `src/index.js` y reemplaza tu archivo principal (puede ser index.js, server.js o app.js)
- Copia los 3 archivos de `src/routes/` a tu carpeta `src/routes/`

### 3. Deploy
```bash
git add .
git commit -m "Add proveedores, compras, usuarios routes"
git push heroku main
```

### 4. Verificar
Abre en el navegador:
- https://tu-app.herokuapp.com/api/proveedores
- https://tu-app.herokuapp.com/api/compras
- https://tu-app.herokuapp.com/api/usuarios

Si devuelven `[]` (array vacío), todo está funcionando.
