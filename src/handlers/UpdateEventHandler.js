// Basiert auf unserem handlers/UpdateEventHandler.js (Event ändern).
// Mit KI überarbeitet (KI-Log Nr. 6): ändert nur übergebene Felder (F-07), Validierung, SQL ins Repository.
const events = require('../repositories/eventRepository');
const { validateEvent, parseEventId } = require('../validation/eventValidation');
const { HttpError } = require('../middleware/errorHandler');

/**
 * PATCH /api/events/:id (nur Admin) – ändert NUR die übergebenen Felder.
 * Früher wurde logo_url bei jedem PATCH ohne Bild auf NULL gesetzt (Fehler F-07).
 */
class UpdateEventHandler {
  async execute(req, res) {
    const id = parseEventId(req.params.id);
    const fields = validateEvent(req.body, 'update');
    const event = await events.updateEvent(id, fields);
    if (!event) throw new HttpError(404, 'Event nicht gefunden.');
    res.json(event);
  }
}

module.exports = UpdateEventHandler;
