// Mit KI erstellt nach unserem Handler-Muster (KI-Log Nr. 6).
const reservations = require('../repositories/reservationRepository');
const { parseReservationId } = require('../validation/eventValidation');

/** POST /internal/reservations/:id/confirm – nach erfolgreicher Zahlung (nur orders-Service) */
class ConfirmReservationHandler {
  async execute(req, res) {
    res.json(await reservations.confirmReservation(parseReservationId(req.params.id)));
  }
}

module.exports = ConfirmReservationHandler;
