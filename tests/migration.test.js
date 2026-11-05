// Mit KI erstellt (KI-Log Nr. 6), vom Team geprüft.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { describeWithDb } = require('./helpers/testDb');

/**
 * Prüft die Migration 001 an einer Nachbildung der HEUTIGEN Heroku-Datenbank:
 * Events liegen in "public", Tickets verweisen per Fremdschlüssel darauf.
 * So sehen wir vor dem Ernstfall, ob Daten und Verweise den Umzug überstehen.
 */
describeWithDb('Migration 001: events von public nach catalog', () => {
  let pool;
  const migration = fs.readFileSync(path.join(__dirname, '../db/migrations/001_move_events_to_catalog.sql'), 'utf8');

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('DROP SCHEMA IF EXISTS catalog CASCADE');
    await pool.query('DROP TABLE IF EXISTS public.tickets, public.events');
    // So sieht es im alten Monolithen aus
    await pool.query(`
      CREATE TABLE public.events (
        event_id SERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL, description TEXT, location VARCHAR(200),
        event_date TIMESTAMP, price NUMERIC(10,2), logo_url TEXT, event_stock INTEGER,
        category VARCHAR(50) DEFAULT 'Konzerte', address VARCHAR(300), latitude NUMERIC(9,6), longitude NUMERIC(9,6));
      CREATE TABLE public.tickets (
        ticket_id SERIAL PRIMARY KEY, event_id INTEGER REFERENCES public.events(event_id), ticket_code VARCHAR(50));
      INSERT INTO public.events (title, location, event_date, price, event_stock) VALUES
        ('Rock am Ring', 'Nürburgring', '2026-06-05 18:00', 199.99, 500),
        ('Stand-up', 'Karlsruhe', '2026-11-28 20:00', 24, 0);
      INSERT INTO public.tickets (event_id, ticket_code) VALUES (1, 'TIX-AAAA');
    `);
  });

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS public.tickets');
    await pool.query('DROP SCHEMA IF EXISTS catalog CASCADE');
    await pool.end();
  });

  test('Migration läuft durch; Daten, IDs und Fremdschlüssel bleiben erhalten', async () => {
    await pool.query(migration);

    const events = await pool.query('SELECT event_id, title FROM catalog.events ORDER BY event_id');
    expect(events.rows).toEqual([{ event_id: 1, title: 'Rock am Ring' }, { event_id: 2, title: 'Stand-up' }]);

    const old = await pool.query("SELECT to_regclass('public.events') AS t");
    expect(old.rows[0].t).toBeNull();

    // Der Fremdschlüssel von tickets zeigt jetzt auf catalog.events
    await expect(pool.query("INSERT INTO public.tickets (event_id, ticket_code) VALUES (999, 'X')")).rejects.toThrow(/foreign key/);
  });

  test('neue Datenbankregeln greifen: negativer Bestand wird abgewiesen', async () => {
    await expect(pool.query('UPDATE catalog.events SET event_stock = -1 WHERE event_id = 1')).rejects.toThrow(/events_stock_not_negative/);
  });

  test('altes Backend findet "events" ohne Schema-Namen weiterhin (neue Verbindung)', async () => {
    const fresh = new Pool({ connectionString: process.env.DATABASE_URL });
    const { rows } = await fresh.query('SELECT count(*)::int AS n FROM events');
    await fresh.end();
    expect(rows[0].n).toBe(2);
  });

  test('Reservierungstabellen sind angelegt', async () => {
    const { rows } = await pool.query(
      "SELECT to_regclass('catalog.reservations') IS NOT NULL AS r, to_regclass('catalog.reservation_items') IS NOT NULL AS i"
    );
    expect(rows[0]).toEqual({ r: true, i: true });
  });
});
