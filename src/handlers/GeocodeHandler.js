// Basiert auf unserem Geocode-Route in config/server.js (Adresssuche über Nominatim).
// Mit KI überarbeitet (KI-Log Nr. 6): eigener Handler, nur für Admins.
const { searchAddress } = require('../services/geocodeService');

/**
 * GET /api/geocode?q=Stuttgart Hauptbahnhof (nur Admin – sonst könnte jeder unseren Nominatim-Zugang ausnutzen).
 * Externe Integration: OpenStreetMap Nominatim, mit Zwischenspeicher (siehe services/geocodeService.js).
 */
class GeocodeHandler {
  async execute(req, res) {
    res.json(await searchAddress(req.query.q));
  }
}

module.exports = GeocodeHandler;
