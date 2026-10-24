// Basiert auf unserem handlers/DeleteEventHandler.js (Event löschen).
// Mit KI überarbeitet (KI-Log Nr. 6): 404 bei unbekanntem Event, 409 solange Reservierungen bestehen.
const events = require('../repositories/eventRepository');
const { parseEventId } = require('../validation/eventValidation');
const { HttpError } = require('../middleware/errorHandler');

/** DELETE /api/events/:id (nur Admin) – 409, solange offene Reservierungen bestehen */
class DeleteEventHandler {
  async execute(req, res) {
    const deleted = await events.deleteEvent(parseEventId(req.params.id));
    if (!deleted) throw new HttpError(404, 'Event nicht gefunden.');
    res.status(204).end();
  }
}

module.exports = DeleteEventHandler;
