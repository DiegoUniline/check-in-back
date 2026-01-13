const bcrypt = require('bcryptjs');
const pool = require('./config/database');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  try {
    const hash = await bcrypt.hash('123456', 10);
    console.log('Hash generado:', hash);
    
    await pool.query(
      'INSERT INTO usuarios (id, email, password_hash, nombre, rol) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), 'diego.leon@uniline.mx', hash, 'Diego León', 'Admin']
    );
    
    console.log('Usuario creado exitosamente');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

seed();
