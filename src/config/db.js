const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || '';

const useSsl = !/localhost|127\.0\.0\.1|host=\/|@\/|%2F/.test(connectionString) && process.env.PGSSL !== 'false';

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  options: '-c search_path=catalog',
  max: Number(process.env.PG_POOL_MAX) || 10
});

pool.on('error', (err) => {
  console.error('[db] Unerwarteter Fehler einer Leerlauf-Verbindung:', err.message);
});

module.exports = pool;
