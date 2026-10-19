const events = require('../repositories/eventRepository');
const { validateEvent } = require('../validation/eventValidation');

class CreateEventHandler {
  async execute(req, res) {
    const fields = validateEvent(req.body, 'create');
    const event = await events.createEvent(fields);
    res.status(201).location(`/api/events/${event.event_id}`).json(event);
  }
}

module.exports = CreateEventHandler;
