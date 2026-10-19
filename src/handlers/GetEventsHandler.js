const events = require('../repositories/eventRepository');
const { parseEventFilter } = require('../validation/eventValidation');

class GetEventsHandler {
  async execute(req, res) {
    res.json(await events.listEvents(parseEventFilter(req.query)));
  }
}

module.exports = GetEventsHandler;
