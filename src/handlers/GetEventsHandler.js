// Basiert auf unserem handlers/GetEventsHandler.js (Eventliste für alle).
// Mit KI überarbeitet (KI-Log Nr. 6): Filter (Suche, Ort, Kategorie, Preis, Datum) mit Prüfung, SQL ins Repository.
const events = require('../repositories/eventRepository');
const { parseEventFilter } = require('../validation/eventValidation');

/** GET /api/events?search=&location=&category=Konzerte,Sport&maxPrice=&from= (öffentlich) */
class GetEventsHandler {
  async execute(req, res) {
    res.json(await events.listEvents(parseEventFilter(req.query)));
  }
}

module.exports = GetEventsHandler;
