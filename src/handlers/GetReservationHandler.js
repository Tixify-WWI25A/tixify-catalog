// Mit KI erstellt nach unserem Handler-Muster (KI-Log Nr. 6).
const reservations = require('../repositories/reservationRepository');
const { parseReservationId } = require('../validation/eventValidation');
const { HttpError } = require('../middleware/errorHandler');

/** GET /internal/reservations/:id (nur orders-Service) */
class GetReservationHandler {
  async execute(req, res) {
    const reservation = await reservations.getReservation(parseReservationId(req.params.id));
    if (!reservation) throw new HttpError(404, 'Reservierung nicht gefunden.');
    res.json(reservation);
  }
}

module.exports = GetReservationHandler;
