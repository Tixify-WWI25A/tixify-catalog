// Basiert auf unserem config/graphql.js (GraphQL-Schema und Resolver für Events).
// Mit KI überarbeitet (KI-Log Nr. 6): Autorisierung pro Resolver (F-02), gleiche Validierung und gleiches Repository wie REST, alle Operationen (lesen, anlegen, ändern, löschen).
const { GraphQLError } = require('graphql');
const events = require('../repositories/eventRepository');
const { validateEvent, CATEGORIES } = require('../validation/eventValidation');
const { HttpError } = require('../middleware/errorHandler');
const { extractToken, verifyToken } = require('../middleware/auth');

/**
 * GraphQL bietet denselben Funktionsumfang wie die REST-API für Events:
 * lesen (mit denselben Filtern), anlegen, ändern, löschen, Bestand setzen.
 * Beide Schnittstellen nutzen dasselbe Repository und dieselbe Validierung.
 */
const typeDefs = `#graphql
  "Eine Veranstaltung mit Ticketkontingent"
  type Event {
    event_id: ID!
    title: String!
    description: String
    category: String!
    location: String!
    address: String
    latitude: Float
    longitude: Float
    "Zeitpunkt im ISO-8601-Format"
    event_date: String!
    price: Float!
    event_stock: Int!
    logo_url: String
  }

  "Filter wie bei GET /api/events"
  input EventFilter {
    search: String
    location: String
    categories: [String!]
    maxPrice: Float
    "Nur Events ab diesem Datum (YYYY-MM-DD)"
    from: String
  }

  input CreateEventInput {
    title: String!
    location: String!
    event_date: String!
    price: Float!
    event_stock: Int!
    description: String
    category: String
    address: String
    latitude: Float
    longitude: Float
    logo_url: String
  }

  "Nur die übergebenen Felder werden geändert"
  input UpdateEventInput {
    title: String
    location: String
    event_date: String
    price: Float
    event_stock: Int
    description: String
    category: String
    address: String
    latitude: Float
    longitude: Float
    logo_url: String
  }

  type Query {
    events(filter: EventFilter): [Event!]!
    event(id: ID!): Event
    categories: [String!]!
  }

  type Mutation {
    "Nur für Administratoren"
    createEvent(input: CreateEventInput!): Event!
    "Nur für Administratoren"
    updateEvent(id: ID!, input: UpdateEventInput!): Event!
    "Nur für Administratoren. true, wenn gelöscht"
    deleteEvent(id: ID!): Boolean!
    "Nur für Administratoren. Setzt das Ticketkontingent"
    updateStock(eventId: ID!, stock: Int!): Event!
  }
`;

const CODES = { 400: 'BAD_USER_INPUT', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT' };

function gqlError(status, message, details) {
  return new GraphQLError(message, {
    extensions: { code: CODES[status] || 'INTERNAL_SERVER_ERROR', http: { status }, ...(details ? { details } : {}) }
  });
}

/** Übersetzt HttpError aus Validierung/Repository in GraphQL-Fehler mit passendem Code und HTTP-Status. */
function wrap(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) throw gqlError(err.status, err.message, err.details);
      throw err;
    }
  };
}

function requireAdmin(context) {
  if (!context?.user) throw gqlError(401, context?.authError || 'Nicht angemeldet. Bitte einloggen.');
  if (context.user.role !== 'admin') throw gqlError(403, 'Zugriff verweigert: Administratorrechte erforderlich.');
}

function parseId(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw gqlError(400, 'ID muss eine positive ganze Zahl sein.');
  return n;
}

/** Entfernt Felder, die im GraphQL-Input fehlen (null von GraphQL = bewusst geleert, bleibt erhalten). */
function definedOnly(input) {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
}

const resolvers = {
  Query: {
    events: wrap(async (_, { filter }) => {
      const f = filter || {};
      if (f.categories?.some((c) => !CATEGORIES.includes(c))) throw gqlError(400, 'Unbekannte Kategorie.');
      if (f.maxPrice !== undefined && f.maxPrice !== null && f.maxPrice < 0) throw gqlError(400, 'maxPrice muss ≥ 0 sein.');
      if (f.from && Number.isNaN(Date.parse(f.from))) throw gqlError(400, 'from muss ein Datum sein.');
      return events.listEvents({
        search: f.search?.trim() || undefined,
        location: f.location || undefined,
        categories: f.categories || undefined,
        maxPrice: f.maxPrice ?? undefined,
        from: f.from || undefined
      });
    }),
    event: wrap(async (_, { id }) => events.getEvent(parseId(id))),
    categories: () => CATEGORIES
  },
  Mutation: {
    createEvent: wrap(async (_, { input }, context) => {
      requireAdmin(context);
      return events.createEvent(validateEvent(definedOnly(input), 'create'));
    }),
    updateEvent: wrap(async (_, { id, input }, context) => {
      requireAdmin(context);
      const event = await events.updateEvent(parseId(id), validateEvent(definedOnly(input), 'update'));
      if (!event) throw gqlError(404, 'Event nicht gefunden.');
      return event;
    }),
    deleteEvent: wrap(async (_, { id }, context) => {
      requireAdmin(context);
      const deleted = await events.deleteEvent(parseId(id));
      if (!deleted) throw gqlError(404, 'Event nicht gefunden.');
      return true;
    }),
    updateStock: wrap(async (_, { eventId, stock }, context) => {
      requireAdmin(context);
      const { event_stock: valid } = validateEvent({ event_stock: stock }, 'update');
      const event = await events.updateStock(parseId(eventId), valid);
      if (!event) throw gqlError(404, 'Event nicht gefunden.');
      return event;
    })
  }
};

/** Liest das Token; ungültig/fehlend bricht nicht ab, weil Queries öffentlich sind. */
function buildContext(req) {
  const token = extractToken(req.headers.authorization);
  if (!token) return { user: null, authError: null };
  try {
    return { user: verifyToken(token), authError: null };
  } catch {
    return { user: null, authError: 'Sitzung abgelaufen oder ungültig.' };
  }
}

/** Express-Handler für POST /graphql; übernimmt den HTTP-Status aus den Resolvern (401/403/404 …). */
function createGraphQLHandler(apollo) {
  return async (req, res) => {
    const response = await apollo.executeOperation(
      { query: req.body?.query, variables: req.body?.variables, operationName: req.body?.operationName },
      { contextValue: buildContext(req) }
    );
    if (response.body.kind !== 'single') {
      return res.status(400).json({ errors: [{ message: 'Inkrementelle Antworten werden nicht unterstützt.' }] });
    }
    return res.status(response.http.status || 200).json(response.body.singleResult);
  };
}

module.exports = { typeDefs, resolvers, buildContext, createGraphQLHandler };
