// Basiert auf unserem SQL aus handlers/*Event*Handler.js (Abfragen auf die Tabelle events).
// Mit KI überarbeitet (KI-Log Nr. 6): an einer Stelle gesammelt, Filter als Parameter (keine SQL-Injection), Änderung nur übergebener Felder.
const pool = require('../config/db');
const { HttpError } = require('../middleware/errorHandler');

/**
 * Einzige Stelle, an der SQL für Events steht. REST-Handler und GraphQL-Resolver
 * nutzen beide dieses Modul – so verhalten sich beide Schnittstellen garantiert gleich.
 */

/** Wandelt eine DB-Zeile in das API-Format um (NUMERIC kommt aus pg als String). */
function toEvent(row) {
  if (!row) return null;
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  return {
    event_id: row.event_id,
    title: row.title,
    description: row.description,
    category: row.category,
    location: row.location,
    address: row.address,
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    event_date: row.event_date instanceof Date ? row.event_date.toISOString() : row.event_date,
    price: Number(row.price),
    event_stock: row.event_stock,
    logo_url: row.logo_url
  };
}

// Spalten, die per create/update geschrieben werden dürfen (Whitelist gegen SQL-Injection über Feldnamen)
const WRITABLE = ['title', 'description', 'category', 'location', 'address', 'latitude', 'longitude', 'event_date', 'price', 'event_stock', 'logo_url'];

async function listEvents({ search, location, categories, maxPrice, from } = {}) {
  const where = [];
  const params = [];
  // Legt den Wert als Parameter ab und liefert seinen Platzhalter ($1, $2, …) – Werte nie direkt ins SQL
  const p = (value) => { params.push(value); return `$${params.length}`; };

  if (search) {
    const s = p(`%${search}%`);
    where.push(`(title ILIKE ${s} OR description ILIKE ${s} OR location ILIKE ${s})`);
  }
  if (location) where.push(`location = ${p(location)}`);
  if (categories?.length) where.push(`category = ANY(${p(categories)})`);
  if (maxPrice !== undefined) where.push(`price <= ${p(maxPrice)}`);
  if (from) where.push(`event_date >= ${p(from)}`);

  const sql = `SELECT * FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY event_date ASC, event_id ASC`;
  const { rows } = await pool.query(sql, params);
  return rows.map(toEvent);
}

async function getEvent(id) {
  const { rows } = await pool.query('SELECT * FROM events WHERE event_id = $1', [id]);
  return toEvent(rows[0]);
}

async function createEvent(fields) {
  const cols = WRITABLE.filter((c) => fields[c] !== undefined);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const { rows } = await pool.query(
    `INSERT INTO events (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    cols.map((c) => fields[c])
  );
  return toEvent(rows[0]);
}

/**
 * Ändert NUR die übergebenen Felder. (Das alte Backend setzte logo_url bei jedem Update
 * auf NULL, wenn kein Bild mitgeschickt wurde.) Ein Feld explizit auf null setzen löscht es.
 */
async function updateEvent(id, fields) {
  const cols = WRITABLE.filter((c) => fields[c] !== undefined);
  if (cols.length === 0) return getEvent(id);
  const sets = cols.map((c, i) => `${c} = $${i + 1}`);
  const { rows } = await pool.query(
    `UPDATE events SET ${sets.join(', ')} WHERE event_id = $${cols.length + 1} RETURNING *`,
    [...cols.map((c) => fields[c]), id]
  );
  return toEvent(rows[0]);
}

async function updateStock(id, stock) {
  const { rows } = await pool.query('UPDATE events SET event_stock = $1 WHERE event_id = $2 RETURNING *', [stock, id]);
  return toEvent(rows[0]);
}

/**
 * Löscht ein Event. Gab es dafür schon Reservierungen oder Tickets, wird das Löschen
 * verweigert (409) – sonst gingen Buchungsdaten verloren. Solche Events später „absagen“ statt löschen.
 */
async function deleteEvent(id) {
  try {
    const { rowCount } = await pool.query('DELETE FROM events WHERE event_id = $1', [id]);
    return rowCount > 0;
  } catch (err) {
    if (err.code === '23503') {
      throw new HttpError(409, 'Für dieses Event existieren bereits Reservierungen oder Tickets. Es kann nicht gelöscht werden.');
    }
    throw err;
  }
}

module.exports = { listEvents, getEvent, createEvent, updateEvent, updateStock, deleteEvent, toEvent };
