// Mit KI erstellt nach unserem Handler-Muster (KI-Log Nr. 6): interne Routen für den orders-Service.
const { buildRouter } = require('./buildRouter');
const { internal } = require('../middleware/auth');

/**
 * /internal/reservations – nur für den orders-Service (Header X-Internal-Token).
 * Das gateway leitet /internal nie nach außen weiter.
 */
const routes = [
  ['post', '/',            'CreateReservationHandler',  internal],
  ['get',  '/:id',         'GetReservationHandler',     internal],
  ['post', '/:id/confirm', 'ConfirmReservationHandler', internal],
  ['post', '/:id/release', 'ReleaseReservationHandler', internal]
];

module.exports = { routes, router: buildRouter(routes) };
