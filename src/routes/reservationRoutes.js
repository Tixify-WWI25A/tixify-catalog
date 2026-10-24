// Mit KI erstellt nach unserem Handler-Muster (KI-Log Nr. 6): interne Routen für den orders-Service; Schleife aus unseren Routen-Dateien.
const express = require('express');
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

const router = express.Router();

routes.forEach(([method, path, handlerName, middlewares = []]) => {
  const HandlerClass = require(`../handlers/${handlerName}`);
  const handlerInstance = new HandlerClass();
  router[method](path, ...middlewares, (req, res) => handlerInstance.execute(req, res));
});

module.exports = { routes, router };
