const events = require('../repositories/eventRepository');
const { parseEventId } = require('../validation/eventValidation');
const { HttpError } = require('../middleware/errorHandler');

class DeleteEventHandler {
  async execute(req, res) {
    const deleted = await events.deleteEvent(parseEventId(req.params.id));
    if (!deleted) throw new HttpError(404, 'Event nicht gefunden.');
    res.status(204).end();
  }
}

module.exports = DeleteEventHandler;
