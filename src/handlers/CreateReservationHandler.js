// Mit KI erstellt nach unserem Handler-Muster (KI-Log Nr. 6): Tickets für den orders-Service reservieren.
const reservations = require('../repositories/reservationRepository');
const { validateReservationItems } = require('../validation/eventValidation');
const { HttpError } = require('../middleware/errorHandler');

/**
 * POST /internal/reservations  { orderRef, items: [{ eventId, quantity }] }  (nur orders-Service)
 * Synchron als begründete Ausnahme: Der Kunde braucht VOR der Zahlung die Zusage,
 * dass seine Tickets gesichert sind (siehe ADR „Synchrone Reservierung“).
 */
class CreateReservationHandler {
  async execute(req, res) {
    const orderRef = req.body?.orderRef;
    if (typeof orderRef !== 'string' || orderRef.length < 1 || orderRef.length > 100) {
      throw new HttpError(400, 'orderRef muss ein Text mit 1 bis 100 Zeichen sein.');
    }
    const items = validateReservationItems(req.body?.items);
    const { created, reservation } = await reservations.createReservation(orderRef, items);
    // 201 = neu angelegt, 200 = dieselbe orderRef kam schon einmal (idempotente Wiederholung)
    res.status(created ? 201 : 200).json(reservation);
  }
}

module.exports = CreateReservationHandler;
