const events = require('../repositories/eventRepository');
const { parseEventId } = require('../validation/eventValidation');
const { HttpError } = require('../middleware/errorHandler');

class GetEventByIdHandler {
  async execute(req, res) {
    const event = await events.getEvent(parseEventId(req.params.id));
    if (!event) throw new HttpError(404, 'Event nicht gefunden.');
    res.json(event);
  }
}

module.exports = GetEventByIdHandler;
