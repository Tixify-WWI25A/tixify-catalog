// Basiert auf unserem app.js / config/server.js (Express-App, Routen mit app.use('/api/…') einhängen, GraphQL).
// Mit KI überarbeitet (KI-Log Nr. 6): nur noch Events, Geocoding und Reservierungen; interne Routen für den orders-Service.
const express = require('express');
const helmet = require('helmet');
const { ApolloServer } = require('@apollo/server');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { typeDefs, resolvers, createGraphQLHandler } = require('./config/graphql');
const eventRoutes = require('./routes/eventRoutes');
const geocodeRoutes = require('./routes/geocodeRoutes');
const reservationRoutes = require('./routes/reservationRoutes');

/**
 * Alle Routen-Dateien und wo sie eingehängt werden – wie im ursprünglichen Backend (app.use('/api/…')).
 * Wird auch von den Tests genutzt, die JEDE Route auf die richtigen Rechte prüfen.
 */
const mounted = [
  ['/api/events',            eventRoutes],
  ['/api/geocode',           geocodeRoutes],
  ['/internal/reservations', reservationRoutes]
];

/** Baut die Express-App ohne sie zu starten – so können Tests sie direkt mit supertest aufrufen. */
async function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'catalog' }));

  for (const [path, routeFile] of mounted) app.use(path, routeFile.router);

  const apollo = new ApolloServer({
    typeDefs,
    resolvers,
    includeStacktraceInErrorResponses: process.env.NODE_ENV !== 'production'
  });
  await apollo.start();
  app.post('/graphql', createGraphQLHandler(apollo));

  app.use(notFound);
  app.use(errorHandler);

  app.locals.apollo = apollo;
  return app;
}

module.exports = { createApp, mounted };
