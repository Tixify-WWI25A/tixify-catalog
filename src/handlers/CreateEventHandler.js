// Basiert auf unserem handlers/CreateEventHandler.js (Event anlegen).
// Mit KI überarbeitet (KI-Log Nr. 6): vollständige Validierung inkl. Kategorie und Koordinaten, SQL ins Repository.
const events = require('../repositories/eventRepository');
const { validateEvent } = require('../validation/eventValidation');

/** POST /api/events (nur Admin) – Use-Case 2 */
class CreateEventHandler {
  async execute(req, res) {
    const fields = validateEvent(req.body, 'create');
    const event = await events.createEvent(fields);
    res.status(201).location(`/api/events/${event.event_id}`).json(event);
  }
}

module.exports = CreateEventHandler;
