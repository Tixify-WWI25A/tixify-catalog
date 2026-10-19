// Basiert auf unserem Geocode-Route in config/server.js (Nominatim-Abfrage mit Map als Zwischenspeicher).
// Mit KI überarbeitet (KI-Log Nr. 6): Zeitlimit, Zwischenspeicher mit Ablaufzeit und Obergrenze, Fehlerbehandlung.
const { HttpError } = require('../middleware/errorHandler');

/**
 * Adresssuche über Nominatim (OpenStreetMap) mit Zwischenspeicher.
 *
 * Warum ein Cache: Nominatim erlaubt höchstens 1 Anfrage pro Sekunde. Beim Tippen im Admin-Formular
 * entstehen viele gleiche Anfragen – aus dem Cache kommen sie sofort und belasten Nominatim nicht.
 * Der Cache ist begrenzt (MAX_ENTRIES, älteste fliegen zuerst raus) – der alte Cache im Monolithen
 * konnte unbegrenzt wachsen und legte pro Eintrag einen eigenen Timer an.
 */

const TTL_MS = 60 * 60 * 1000; // 1 Stunde
const MAX_ENTRIES = 500;
const TIMEOUT_MS = 5000;

const cache = new Map(); // Map behält die Einfügereihenfolge → ältester Eintrag ist der erste

function getCached(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return undefined;
  }
  return hit.data;
}

function setCached(key, data) {
  cache.delete(key);
  cache.set(key, { data, expires: Date.now() + TTL_MS });
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

async function searchAddress(query, fetchImpl = fetch) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  if (q.length > 200) throw new HttpError(400, 'Suchbegriff ist zu lang.');

  const key = q.toLowerCase();
  const cached = getCached(key);
  if (cached) return cached;

  let response;
  try {
    response = await fetchImpl(
      `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=de,at,ch&q=${encodeURIComponent(q)}`,
      {
        headers: {
          // Nominatim verlangt einen eindeutigen User-Agent mit echter Kontaktadresse
          'User-Agent': `TixifyCatalog/1.0 (${process.env.NOMINATIM_CONTACT || 'contact-not-configured'})`
        },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      }
    );
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'antwortet nicht' : 'ist nicht erreichbar';
    throw new HttpError(503, `Die Adresssuche ${reason}. Bitte Koordinaten manuell eintragen.`);
  }

  if (response.status === 429) throw new HttpError(503, 'Die Adresssuche ist gerade überlastet. Bitte kurz warten.');
  if (!response.ok) throw new HttpError(502, 'Die Adresssuche hat einen Fehler gemeldet.');

  const raw = await response.json();
  // Nur die Felder weitergeben, die das Frontend braucht
  const results = (Array.isArray(raw) ? raw : []).map((r) => ({
    display_name: r.display_name,
    lat: r.lat,
    lon: r.lon
  }));
  setCached(key, results);
  return results;
}

function clearCache() {
  cache.clear();
}

module.exports = { searchAddress, clearCache, MAX_ENTRIES };
