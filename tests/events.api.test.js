// Mit KI erstellt (KI-Log Nr. 6), vom Team geprüft.
const request = require('supertest');
const { describeWithDb, resetSchema, insertEvent, bearer, token } = require('./helpers/testDb');

describeWithDb('Events-API (HTTP + echte Datenbank)', () => {
  let app;
  let pool;
  // Alle öffentlichen Routen mit vollem Pfad, z. B. ['patch', '/api/events/:id', 'UpdateEventHandler', [...]]
  const publicRoutes = require('../src/app').mounted
    .filter(([base]) => base.startsWith('/api'))
    .flatMap(([base, file]) => file.routes.map(([m, p, ...rest]) => [m, p === '/' ? base : base + p, ...rest]));

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

  const newEvent = {
    title: 'Lumen – Live in Stuttgart',
    location: 'Stuttgart',
    category: 'Konzerte',
    event_date: '2026-11-14T19:00:00Z',
    price: 49,
    event_stock: 120,
    logo_url: 'https://example.com/lumen.png'
  };

  describe('Absicherung: jede schreibende Route verlangt Admin-Rechte', () => {
    // Genau diese Lücke hatte das alte Backend (Middlewares in eventRoutes.js ignoriert).
    // Der Test geht ALLE Routen aus der Routentabelle durch – auch künftige.
    const protectedRoutes = publicRoutes.filter(([method, path]) => method !== 'get' || path === '/api/geocode');
    const url = (path) => path.replace(':id', '1');

    test.each(protectedRoutes.map(([m, p]) => [m.toUpperCase(), p, m]))('%s %s ohne Token → 401', async (_, path, method) => {
      const res = await request(app)[method](url(path)).send({});
      expect(res.status).toBe(401);
    });

    test.each(protectedRoutes.map(([m, p]) => [m.toUpperCase(), p, m]))('%s %s als Kunde → 403', async (_, path, method) => {
      const res = await request(app)[method](url(path)).set('Authorization', bearer('customer')).send({});
      expect(res.status).toBe(403);
    });

    test('abgelaufenes Token → 401', async () => {
      const res = await request(app).post('/api/events')
        .set('Authorization', `Bearer ${token('admin', { expiresIn: -10 })}`).send(newEvent);
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/abgelaufen/);
    });
  });

  describe('Anlegen (Use-Case 2)', () => {
    test('Admin legt Event an → 201, Location-Header, Daten in der DB', async () => {
      const res = await request(app).post('/api/events').set('Authorization', bearer('admin')).send(newEvent);

      expect(res.status).toBe(201);
      expect(res.headers.location).toBe(`/api/events/${res.body.event_id}`);
      expect(res.body).toMatchObject({ title: 'Lumen – Live in Stuttgart', price: 49, event_stock: 120 });

      const { rows } = await pool.query('SELECT title FROM catalog.events');
      expect(rows).toEqual([{ title: 'Lumen – Live in Stuttgart' }]);
    });

    test('ungültige Eingaben → 400 mit Fehlern pro Feld, nichts gespeichert', async () => {
      const res = await request(app).post('/api/events').set('Authorization', bearer('admin'))
        .send({ ...newEvent, price: -5, event_stock: 'viele' });

      expect(res.status).toBe(400);
      expect(Object.keys(res.body.details).sort()).toEqual(['event_stock', 'price']);
      expect((await pool.query('SELECT count(*)::int AS n FROM catalog.events')).rows[0].n).toBe(0);
    });

    test('kaputtes JSON → 400 statt 500', async () => {
      const res = await request(app).post('/api/events').set('Authorization', bearer('admin'))
        .set('Content-Type', 'application/json').send('{"title": ');
      expect(res.status).toBe(400);
    });
  });

  describe('Ändern und Löschen', () => {
    test('PATCH ändert nur den Preis – das Bild bleibt erhalten', async () => {
      const id = await insertEvent(pool);
      const res = await request(app).patch(`/api/events/${id}`).set('Authorization', bearer('admin')).send({ price: 59.5 });

      expect(res.status).toBe(200);
      expect(res.body.price).toBe(59.5);
      expect(res.body.logo_url).toBe('https://example.com/bild.png');
    });

    test('PATCH mit logo_url: null entfernt das Bild bewusst', async () => {
      const id = await insertEvent(pool);
      const res = await request(app).patch(`/api/events/${id}`).set('Authorization', bearer('admin')).send({ logo_url: null });
      expect(res.body.logo_url).toBeNull();
    });

    test('PATCH auf unbekanntes Event → 404', async () => {
      const res = await request(app).patch('/api/events/999').set('Authorization', bearer('admin')).send({ price: 1 });
      expect(res.status).toBe(404);
    });

    test('DELETE → 204, danach 404', async () => {
      const id = await insertEvent(pool);
      expect((await request(app).delete(`/api/events/${id}`).set('Authorization', bearer('admin'))).status).toBe(204);
      expect((await request(app).get(`/api/events/${id}`)).status).toBe(404);
    });

    test('DELETE eines Events mit Reservierungen → 409, Event bleibt', async () => {
      const id = await insertEvent(pool);
      await request(app).post('/internal/reservations').set('X-Internal-Token', 'test-internal-token')
        .send({ orderRef: 'o-1', items: [{ eventId: id, quantity: 1 }] });

      const res = await request(app).delete(`/api/events/${id}`).set('Authorization', bearer('admin'));
      expect(res.status).toBe(409);
      expect((await request(app).get(`/api/events/${id}`)).status).toBe(200);
    });

    test('ungültige ID → 400 statt Datenbankfehler', async () => {
      expect((await request(app).get('/api/events/abc')).status).toBe(400);
    });
  });

  describe('Suche und Filter (Use-Case 1)', () => {
    beforeEach(async () => {
      await insertEvent(pool, { title: 'Rock Nacht', location: 'Stuttgart', category: 'Konzerte', price: 30, event_date: '2026-11-20T19:00:00Z' });
      await insertEvent(pool, { title: 'Stand-up Abend', location: 'Karlsruhe', category: 'Comedy', price: 20, event_date: '2026-11-10T19:00:00Z' });
      await insertEvent(pool, { title: 'Winter Sounds', location: 'Mannheim', category: 'Festivals', price: 89, event_date: '2026-12-05T14:00:00Z' });
    });

    const titles = (res) => res.body.map((e) => e.title);

    test('ohne Filter: alle, nach Datum sortiert', async () => {
      expect(titles(await request(app).get('/api/events'))).toEqual(['Stand-up Abend', 'Rock Nacht', 'Winter Sounds']);
    });

    test.each([
      ['search=rock', ['Rock Nacht']],
      ['location=Karlsruhe', ['Stand-up Abend']],
      ['category=Comedy,Festivals', ['Stand-up Abend', 'Winter Sounds']],
      ['maxPrice=30', ['Stand-up Abend', 'Rock Nacht']],
      ['from=2026-11-15', ['Rock Nacht', 'Winter Sounds']],
      ['location=Alle Orte', ['Stand-up Abend', 'Rock Nacht', 'Winter Sounds']]
    ])('?%s', async (query, expected) => {
      expect(titles(await request(app).get(`/api/events?${query}`))).toEqual(expected);
    });

    test('SQL-Sonderzeichen in der Suche werden als Text behandelt', async () => {
      const res = await request(app).get(`/api/events?search=${encodeURIComponent("'; DROP TABLE events; --")}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect((await pool.query('SELECT count(*)::int AS n FROM catalog.events')).rows[0].n).toBe(3);
    });

    test('ungültige Filter → 400', async () => {
      expect((await request(app).get('/api/events?category=Oper')).status).toBe(400);
      expect((await request(app).get('/api/events?maxPrice=-1')).status).toBe(400);
    });
  });

  describe('Nicht-funktionale Anforderung: Antwortzeit', () => {
    test('Eventliste mit 500 Events antwortet in unter 1,5 Sekunden', async () => {
      await pool.query(`
        INSERT INTO catalog.events (title, location, event_date, price, event_stock)
        SELECT 'Event ' || i, 'Stuttgart', now() + (i || ' days')::interval, 10 + i % 90, 100
        FROM generate_series(1, 500) AS i`);

      const start = performance.now();
      const res = await request(app).get('/api/events?search=Event');
      const ms = performance.now() - start;

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(500);
      expect(ms).toBeLessThan(1500);
    });
  });

  test('unbekannter Endpunkt → 404 im einheitlichen Fehlerformat', async () => {
    const res = await request(app).get('/api/gibtsnicht');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('/health antwortet', async () => {
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok', service: 'catalog' });
  });
});
