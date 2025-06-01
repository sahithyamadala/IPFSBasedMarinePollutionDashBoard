// db.js
const mysql = require('mysql2/promise'); // Note the /promise here
require('dotenv').config();

// Create and export a connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'reports_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the connection immediately
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ db.js: Database connection pool initialized successfully');
    connection.release();
  } catch (err) {
    console.error('❌ db.js: Failed to connect to MySQL:', err.message);
  }
})();

module.exports = pool;