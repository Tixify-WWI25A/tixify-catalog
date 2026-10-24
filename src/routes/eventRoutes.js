// Basiert auf unserem routes/eventRoutes.js (Routen-Tabelle mit checkLogin und requireAdmin).
// Schleife: unser System; übergibt jetzt die Middlewares (Fehler F-01 behoben, KI-Log Nr. 6).
const express = require('express');
const { admin } = require('../middleware/auth');

/** /api/events – lesen für alle, ändern nur für Admins. Die Rechte stehen direkt in der Zeile. */
const routes = [
  ['get',    '/',    'GetEventsHandler'],
  ['get',    '/:id', 'GetEventByIdHandler'],
  ['post',   '/',    'CreateEventHandler', admin],
  ['patch',  '/:id', 'UpdateEventHandler', admin],
  ['delete', '/:id', 'DeleteEventHandler', admin]
];

const router = express.Router();

routes.forEach(([method, path, handlerName, middlewares = []]) => {
  const HandlerClass = require(`../handlers/${handlerName}`);
  const handlerInstance = new HandlerClass();
  router[method](path, ...middlewares, (req, res) => handlerInstance.execute(req, res));
});

module.exports = { routes, router };
