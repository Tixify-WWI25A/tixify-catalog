// Mit KI erstellt (KI-Log Nr. 6), vom Team geprüft.
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

/**
 * Hilfen für Tests gegen eine ECHTE PostgreSQL-Datenbank.
 * Lokal: DATABASE_URL auf eine leere Testdatenbank setzen. In der CI startet GitHub Actions Postgres.
 * Ohne DATABASE_URL werden die Datenbank-Tests übersprungen.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const describeWithDb = hasDb ? describe : describe.skip;

const SCHEMA_SQL = fs.readFileSync(path.join(__dirname, '../../db/schema.sql'), 'utf8');

/** Setzt das Schema "catalog" komplett neu auf. */
async function resetSchema(pool) {
  await pool.query('DROP SCHEMA IF EXISTS catalog CASCADE');
  await pool.query(SCHEMA_SQL);
}

async function insertEvent(pool, overrides = {}) {
  const e = {
    title: 'Testkonzert',
    location: 'Stuttgart',
    category: 'Konzerte',
    event_date: '2026-12-01T19:00:00Z',
    price: 49.9,
    event_stock: 10,
    logo_url: 'https://example.com/bild.png',
    ...overrides
  };
  const { rows } = await pool.query(
    `INSERT INTO catalog.events (title, location, category, event_date, price, event_stock, logo_url, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING event_id`,
    [e.title, e.location, e.category, e.event_date, e.price, e.event_stock, e.logo_url, e.description || '']
  );
  return rows[0].event_id;
}

const token = (role, opts = {}) =>
  jwt.sign({ userId: 1, email: `${role}@tixify.test`, role }, process.env.JWT_SECRET, { algorithm: 'HS256', ...opts });

const bearer = (role) => `Bearer ${token(role)}`;

module.exports = { hasDb, describeWithDb, resetSchema, insertEvent, token, bearer };
