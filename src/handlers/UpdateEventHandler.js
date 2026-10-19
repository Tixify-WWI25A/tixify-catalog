const events = require('../repositories/eventRepository');
const { validateEvent, parseEventId } = require('../validation/eventValidation');
const { HttpError } = require('../middleware/errorHandler');

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
