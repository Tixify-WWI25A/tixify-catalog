// Mit KI erstellt (KI-Log Nr. 6), vom Team geprüft.
const request = require('supertest');
const { describeWithDb, resetSchema, insertEvent, bearer } = require('./helpers/testDb');

describeWithDb('GraphQL (gleicher Funktionsumfang wie REST)', () => {
  let app;
  let pool;

  beforeAll(async () => {
    pool = require('../src/config/db');
    await resetSchema(pool);
    app = await require('../src/app').createApp();
  });

  afterAll(async () => {
    await app.locals.apollo.stop();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE catalog.reservation_items, catalog.reservations, catalog.events RESTART IDENTITY CASCADE');
  });

  const gql = (query, variables, role) => {
    const req = request(app).post('/graphql').send({ query, variables });
    return role ? req.set('Authorization', bearer(role)) : req;
  };

  const CREATE = `mutation($input: CreateEventInput!) { createEvent(input: $input) { event_id title price category logo_url } }`;
  const input = { title: 'GraphQL Gala', location: 'Mannheim', event_date: '2026-12-24T18:00:00Z', price: 25, event_stock: 50, logo_url: 'https://example.com/g.png' };

  test('events mit Filter liefert dieselben Treffer wie REST', async () => {
    await insertEvent(pool, { title: 'Rock Nacht', category: 'Konzerte' });
    await insertEvent(pool, { title: 'Witzig', category: 'Comedy' });

    const res = await gql('{ events(filter: { categories: ["Comedy"] }) { title category } }');
    const rest = await request(app).get('/api/events?category=Comedy');

    expect(res.body.data.events).toEqual([{ title: 'Witzig', category: 'Comedy' }]);
    expect(res.body.data.events.map((e) => e.title)).toEqual(rest.body.map((e) => e.title));
  });

  test('event(id) und categories', async () => {
    const id = await insertEvent(pool, { title: 'Einzeln' });
    const res = await gql(`{ event(id: ${id}) { title } categories }`);
    expect(res.body.data).toEqual({
      event: { title: 'Einzeln' },
      categories: ['Konzerte', 'Festivals', 'Sport', 'Theater', 'Comedy']
    });
  });

  test.each([
    [undefined, 401, 'UNAUTHENTICATED'],
    ['customer', 403, 'FORBIDDEN']
  ])('createEvent als %s → %i %s, nichts gespeichert', async (role, status, code) => {
    const res = await gql(CREATE, { input }, role);
    expect(res.status).toBe(status);
    expect(res.body.errors[0].extensions.code).toBe(code);
    expect((await pool.query('SELECT count(*)::int AS n FROM catalog.events')).rows[0].n).toBe(0);
  });

  test('Admin: anlegen, ändern (Bild bleibt), Bestand setzen, löschen', async () => {
    const created = await gql(CREATE, { input }, 'admin');
    expect(created.status).toBe(200);
    const id = created.body.data.createEvent.event_id;

    const updated = await gql(
      `mutation($id: ID!) { updateEvent(id: $id, input: { price: 30 }) { price logo_url } }`, { id }, 'admin'
    );
    expect(updated.body.data.updateEvent).toEqual({ price: 30, logo_url: 'https://example.com/g.png' });

    const stock = await gql(`mutation($id: ID!) { updateStock(eventId: $id, stock: 7) { event_stock } }`, { id }, 'admin');
    expect(stock.body.data.updateStock.event_stock).toBe(7);

    const deleted = await gql(`mutation($id: ID!) { deleteEvent(id: $id) }`, { id }, 'admin');
    expect(deleted.body.data.deleteEvent).toBe(true);
  });

  test('dieselbe Validierung wie REST: negativer Preis → 400 BAD_USER_INPUT mit Feldfehler', async () => {
    const res = await gql(CREATE, { input: { ...input, price: -1 } }, 'admin');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(res.body.errors[0].extensions.details).toHaveProperty('price');
  });

  test('updateStock mit negativem Wert → 400', async () => {
    const id = await insertEvent(pool);
    const res = await gql(`mutation { updateStock(eventId: ${id}, stock: -3) { event_stock } }`, {}, 'admin');
    expect(res.status).toBe(400);
  });

  test('unbekanntes Event → 404 NOT_FOUND', async () => {
    const res = await gql(`mutation { updateStock(eventId: 999, stock: 1) { event_stock } }`, {}, 'admin');
    expect(res.status).toBe(404);
    expect(res.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });
});
