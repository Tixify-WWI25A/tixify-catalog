// Mit KI-Unterstützung (Gemini) entwickelt (KI-Log Nr. 18): Route für die Adresssuche (nur Admins), vom Team geprüft.
const express = require('express');
const { admin } = require('../middleware/auth');

const routes = [
  ['get', '/', 'GeocodeHandler', admin]
];

const router = express.Router();

routes.forEach(([method, path, handlerName, middlewares = []]) => {
  const HandlerClass = require(`../handlers/${handlerName}`);
  const handlerInstance = new HandlerClass();
  router[method](path, ...middlewares, (req, res) => handlerInstance.execute(req, res));
});

module.exports = { routes, router };
