// Mit KI erstellt (KI-Log Nr. 6), vom Team geprüft. Regeln aus unseren Event-Handlern zusammengeführt und erweitert.
const { HttpError } = require('../middleware/errorHandler');

const CATEGORIES = ['Konzerte', 'Festivals', 'Sport', 'Theater', 'Comedy'];

/**
 * Regeln für jedes Feld eines Events. Wird von REST (POST/PATCH) und GraphQL gemeinsam genutzt,
 * damit beide Schnittstellen exakt dieselben Eingaben akzeptieren.
 * Jede Regel gibt den bereinigten Wert zurück oder wirft eine Fehlermeldung (String).
 */
const rules = {
  title: (v) => text(v, 1, 200),
  description: (v) => text(v ?? '', 0, 5000),
  category: (v) => {
    if (!CATEGORIES.includes(v)) throw `muss eine von ${CATEGORIES.join(', ')} sein`;
    return v;
  },
  location: (v) => text(v, 1, 200),
  address: (v) => (v === null || v === '' ? null : text(v, 1, 300)),
  latitude: (v) => nullableNumber(v, -90, 90),
  longitude: (v) => nullableNumber(v, -180, 180),
  event_date: (v) => {
    const d = new Date(v);
    if (typeof v !== 'string' || Number.isNaN(d.getTime())) throw 'muss ein gültiges Datum sein (ISO 8601)';
    return d.toISOString();
  },
  price: (v) => {
    const n = number(v);
    if (n < 0) throw 'darf nicht negativ sein';
    if (n > 100000) throw 'darf höchstens 100000 sein';
    if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) throw 'darf höchstens zwei Nachkommastellen haben';
    return n;
  },
  event_stock: (v) => {
    const n = number(v);
    if (!Number.isInteger(n)) throw 'muss eine ganze Zahl sein';
    if (n < 0) throw 'darf nicht negativ sein';
    return n;
  },
  logo_url: (v) => {
    if (v === null || v === '') return null;
    const s = text(v, 1, 2000);
    let url;
    try { url = new URL(s); } catch { throw 'muss eine gültige URL sein'; }
    if (!['http:', 'https:'].includes(url.protocol)) throw 'muss mit http:// oder https:// beginnen';
    return s;
  }
};

const REQUIRED_ON_CREATE = ['title', 'location', 'event_date', 'price', 'event_stock'];
const DEFAULTS_ON_CREATE = { description: '', category: 'Konzerte', address: null, latitude: null, longitude: null, logo_url: null };

function text(v, min, max) {
  if (typeof v !== 'string') throw 'muss ein Text sein';
  const s = v.trim();
  if (s.length < min) throw min === 1 ? 'darf nicht leer sein' : `muss mindestens ${min} Zeichen haben`;
  if (s.length > max) throw `darf höchstens ${max} Zeichen haben`;
  return s;
}

function number(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw 'muss eine Zahl sein';
  return n;
}

function nullableNumber(v, min, max) {
  if (v === null || v === '') return null;
  const n = number(v);
  if (n < min || n > max) throw `muss zwischen ${min} und ${max} liegen`;
  return n;
}

/**
 * Prüft die Eingaben. Unbekannte Felder (z. B. event_id) werden ignoriert, nicht übernommen.
 * @param {object} input   Request-Body
 * @param {'create'|'update'} mode  create: Pflichtfelder + Standardwerte; update: nur übergebene Felder
 * @returns {object} bereinigte Felder, bereit für das Repository
 */
function validateEvent(input, mode) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Request-Body muss ein JSON-Objekt sein.');
  }

  const errors = {};
  const clean = {};

  if (mode === 'create') {
    for (const field of REQUIRED_ON_CREATE) {
      if (input[field] === undefined || input[field] === null || input[field] === '') {
        errors[field] = 'ist ein Pflichtfeld';
      }
    }
  }

  for (const [field, rule] of Object.entries(rules)) {
    if (input[field] === undefined || errors[field]) continue;
    try {
      clean[field] = rule(input[field]);
    } catch (message) {
      errors[field] = message;
    }
  }

  const result = mode === 'create' ? { ...DEFAULTS_ON_CREATE, ...clean } : clean;

  const hasLat = 'latitude' in result;
  const hasLng = 'longitude' in result;
  if (hasLat !== hasLng || (hasLat && (result.latitude === null) !== (result.longitude === null))) {
    errors.latitude = errors.latitude || 'Breiten- und Längengrad müssen gemeinsam gesetzt oder gemeinsam leer sein';
  }

  if (Object.keys(errors).length > 0) {
    throw new HttpError(400, 'Ungültige Eingaben.', errors);
  }
  if (mode === 'update' && Object.keys(result).length === 0) {
    throw new HttpError(400, 'Keine änderbaren Felder übergeben.');
  }

  return result;
}

/** Prüft die Positionen einer Reservierung: [{ eventId, quantity }] */
function validateReservationItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, 'items muss eine nicht-leere Liste sein.');
  }
  const seen = new Set();
  return items.map((item, i) => {
    const eventId = Number(item?.eventId);
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(eventId) || eventId <= 0) throw new HttpError(400, `items[${i}].eventId ist ungültig.`);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 100) {
      throw new HttpError(400, `items[${i}].quantity muss eine ganze Zahl zwischen 1 und 100 sein.`);
    }
    if (seen.has(eventId)) throw new HttpError(400, `Event ${eventId} ist mehrfach in items enthalten.`);
    seen.add(eventId);
    return { eventId, quantity };
  });
}

/** Event-ID aus der URL: positive ganze Zahl, sonst 400 */
function parseEventId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Event-ID muss eine positive ganze Zahl sein.');
  return id;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reservierungs-ID aus der URL: UUID, sonst 400 */
function parseReservationId(raw) {
  if (!UUID.test(String(raw))) throw new HttpError(400, 'Reservierungs-ID muss eine UUID sein.');
  return raw;
}

/** Filter für GET /api/events?search=&location=&category=Konzerte,Sport&maxPrice=&from= */
function parseEventFilter(query) {
  const { search, location, category, maxPrice, from } = query;
  const filter = {};

  if (search) filter.search = String(search).trim().slice(0, 100);
  if (location && location !== 'Alle Orte') filter.location = String(location);
  if (category) {
    filter.categories = String(category).split(',').map((c) => c.trim()).filter(Boolean);
    const unknown = filter.categories.filter((c) => !CATEGORIES.includes(c));
    if (unknown.length) throw new HttpError(400, `Unbekannte Kategorie: ${unknown.join(', ')}`);
  }
  if (maxPrice !== undefined && maxPrice !== '') {
    filter.maxPrice = Number(maxPrice);
    if (!Number.isFinite(filter.maxPrice) || filter.maxPrice < 0) throw new HttpError(400, 'maxPrice muss eine Zahl ≥ 0 sein.');
  }
  if (from) {
    if (Number.isNaN(Date.parse(from))) throw new HttpError(400, 'from muss ein Datum sein (YYYY-MM-DD).');
    filter.from = String(from);
  }
  return filter;
}

module.exports = { validateEvent, validateReservationItems, parseEventId, parseReservationId, parseEventFilter, CATEGORIES };