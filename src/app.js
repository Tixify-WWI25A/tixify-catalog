const express = require('express');
const helmet = require('helmet');
const { ApolloServer } = require('@apollo/server');
const { registerRoutes } = require('./http/registerRoutes');
const { errorHandler, notFound } = require('./http/errors');
const { requireAuth, requireAdmin, requireInternal } = require('./auth/auth');
const ev = require('./handlers/eventHandlers');
const rs = require('./handlers/reservationHandlers');
const geo = require('./handlers/geocodeHandlers');
const { typeDefs, resolvers, createGraphQLHandler } = require('./graphql/schema');

const admin = [requireAuth, requireAdmin];
const internal = [requireInternal];

const publicRoutes = [
  ['get', '/events', [], ev.listEvents],
  ['get', '/events/:id', [], ev.getEvent],
  ['post', '/events', admin, ev.createEvent],
  ['patch', '/events/:id', admin, ev.updateEvent],
  ['delete', '/events/:id', admin, ev.deleteEvent],
  ['get', '/geocode', admin, geo.geocode]
];

const internalRoutes = [
  ['post', '/reservations', internal, rs.createReservation],
  ['get', '/reservations/:id', internal, rs.getReservation],
  ['post', '/reservations/:id/confirm', internal, rs.confirmReservation],
  ['post', '/reservations/:id/release', internal, rs.releaseReservation]
];

async function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'catalog' }));

  app.use('/api', registerRoutes(publicRoutes));
  app.use('/internal', registerRoutes(internalRoutes));

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

module.exports = { createApp, publicRoutes, internalRoutes };
