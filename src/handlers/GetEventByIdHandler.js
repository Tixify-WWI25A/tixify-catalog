// Basiert auf unserem handlers/GetEventByIdHandler.js (einzelnes Event).
// Mit KI überarbeitet (KI-Log Nr. 6): Prüfung der ID (400), SQL ins Repository.
const events = require('../repositories/eventRepository');
const { parseEventId } = require('../validation/eventValidation');
const { HttpError } = require('../middleware/errorHandler');

/** GET /api/events/:id (öffentlich) */
class GetEventByIdHandler {
  async execute(req, res) {
    const event = await events.getEvent(parseEventId(req.params.id));
    if (!event) throw new HttpError(404, 'Event nicht gefunden.');
    res.json(event);
  }
}

module.exports = GetEventByIdHandler;
