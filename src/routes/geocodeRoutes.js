// Mit KI erstellt nach unserem Handler-Muster (KI-Log Nr. 6).
const { buildRouter } = require('./buildRouter');
const { admin } = require('../middleware/auth');

/** /api/geocode – Adresse in Koordinaten umwandeln (Admin-Formular „Event anlegen“) */
const routes = [
  ['get', '/', 'GeocodeHandler', admin]
];

module.exports = { routes, router: buildRouter(routes) };
