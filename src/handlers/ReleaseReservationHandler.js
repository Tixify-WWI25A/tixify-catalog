// Mit KI erstellt nach unserem Handler-Muster (KI-Log Nr. 6).
const reservations = require('../repositories/reservationRepository');
const { parseReservationId } = require('../validation/eventValidation');

/** POST /internal/reservations/:id/release – Abbruch oder Fehler, Tickets zurück in den Bestand (nur orders-Service) */
class ReleaseReservationHandler {
  async execute(req, res) {
    res.json(await reservations.releaseReservation(parseReservationId(req.params.id)));
  }
}

module.exports = ReleaseReservationHandler;
