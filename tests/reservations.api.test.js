// Mit KI erstellt (KI-Log Nr. 6), vom Team geprüft.
const request = require('supertest');
const { describeWithDb, resetSchema, insertEvent, bearer } = require('./helpers/testDb');

describeWithDb('Reservierungen (interne API für den orders-Service)', () => {
  let app;
  let pool;
  const INTERNAL = { 'X-Internal-Token': 'test-internal-token' };

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

  const stockOf = async (id) =>
    (await pool.query('SELECT event_stock FROM catalog.events WHERE event_id = $1', [id])).rows[0].event_stock;

  const reserve = (orderRef, items) =>
    request(app).post('/internal/reservations').set(INTERNAL).send({ orderRef, items });

  describe('Zugriffsschutz', () => {
    test('ohne internen Schlüssel → 401', async () => {
      expect((await request(app).post('/internal/reservations').send({})).status).toBe(401);
    });

    test('ein Admin-Login reicht NICHT – nur der Service-Schlüssel', async () => {
      const res = await request(app).post('/internal/reservations').set('Authorization', bearer('admin')).send({});
      expect(res.status).toBe(401);
    });

    test('falscher Schlüssel → 401', async () => {
      const res = await request(app).post('/internal/reservations').set('X-Internal-Token', 'falsch').send({});
      expect(res.status).toBe(401);
    });
  });

  describe('Reservieren', () => {
    test('verringert den Bestand sofort und liefert Preise und Gesamtbetrag aus dem catalog', async () => {
      const a = await insertEvent(pool, { title: 'A', price: 49.99, event_stock: 10 });
      const b = await insertEvent(pool, { title: 'B', price: 20, event_stock: 5 });

      const res = await reserve('order-1', [{ eventId: a, quantity: 2 }, { eventId: b, quantity: 1 }]);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        orderRef: 'order-1',
        status: 'RESERVED',
        totalAmount: 119.98,
        items: [
          { eventId: a, quantity: 2, title: 'A', unitPrice: 49.99 },
          { eventId: b, quantity: 1, title: 'B', unitPrice: 20 }
        ]
      });
      expect(await stockOf(a)).toBe(8);
      expect(await stockOf(b)).toBe(4);
    });

    test('Ablaufzeit liegt 15 Minuten in der Zukunft', async () => {
      const id = await insertEvent(pool);
      const res = await reserve('order-ttl', [{ eventId: id, quantity: 1 }]);
      const minutes = (Date.parse(res.body.expiresAt) - Date.now()) / 60000;
      expect(minutes).toBeGreaterThan(14);
      expect(minutes).toBeLessThanOrEqual(15);
    });

    test('zu wenig Tickets → 409 mit verfügbarer Menge, und NICHTS wird reserviert (alles oder nichts)', async () => {
      const a = await insertEvent(pool, { title: 'A', event_stock: 10 });
      const b = await insertEvent(pool, { title: 'B', event_stock: 1 });

      const res = await reserve('order-2', [{ eventId: a, quantity: 3 }, { eventId: b, quantity: 2 }]);

      expect(res.status).toBe(409);
      expect(res.body.details).toEqual({ eventId: b, requested: 2, available: 1 });
      expect(await stockOf(a)).toBe(10); // A wurde zurückgerollt
      expect((await pool.query('SELECT count(*)::int AS n FROM catalog.reservations')).rows[0].n).toBe(0);
    });

    test('unbekanntes Event → 404', async () => {
      expect((await reserve('order-3', [{ eventId: 999, quantity: 1 }])).status).toBe(404);
    });

    test('gleiche orderRef zweimal → dieselbe Reservierung, Bestand nur einmal abgezogen (Idempotenz)', async () => {
      const id = await insertEvent(pool, { event_stock: 10 });
      const first = await reserve('order-4', [{ eventId: id, quantity: 3 }]);
      const second = await reserve('order-4', [{ eventId: id, quantity: 3 }]);

      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.body.reservationId).toBe(first.body.reservationId);
      expect(await stockOf(id)).toBe(7);
    });

    test('ÜBERBUCHUNG: 20 gleichzeitige Käufe um 5 Tickets → genau 5 erfolgreich, Bestand 0', async () => {
      const id = await insertEvent(pool, { event_stock: 5 });

      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => reserve(`race-${i}`, [{ eventId: id, quantity: 1 }]))
      );

      expect(results.filter((r) => r.status === 201)).toHaveLength(5);
      expect(results.filter((r) => r.status === 409)).toHaveLength(15);
      expect(await stockOf(id)).toBe(0);
    });
  });

  describe('Bestätigen und Freigeben', () => {
    let eventId;
    let reservationId;

    beforeEach(async () => {
      eventId = await insertEvent(pool, { event_stock: 10 });
      reservationId = (await reserve('order-5', [{ eventId, quantity: 4 }])).body.reservationId;
    });

    const confirm = (id = reservationId) => request(app).post(`/internal/reservations/${id}/confirm`).set(INTERNAL);
    const release = (id = reservationId) => request(app).post(`/internal/reservations/${id}/release`).set(INTERNAL);

    test('Bestätigen: Status CONFIRMED, Bestand bleibt verringert, zweites Bestätigen schadet nicht', async () => {
      expect((await confirm()).body.status).toBe('CONFIRMED');
      expect((await confirm()).status).toBe(200);
      expect(await stockOf(eventId)).toBe(6);
    });

    test('Freigeben: Bestand kommt zurück, zweites Freigeben gibt NICHT doppelt zurück', async () => {
      expect((await release()).body.status).toBe('RELEASED');
      expect(await stockOf(eventId)).toBe(10);
      await release();
      expect(await stockOf(eventId)).toBe(10);
    });

    test('bezahlte Reservierung kann nicht mehr freigegeben werden → 409', async () => {
      await confirm();
      expect((await release()).status).toBe(409);
      expect(await stockOf(eventId)).toBe(6);
    });

    test('freigegebene Reservierung kann nicht mehr bestätigt werden → 409', async () => {
      await release();
      expect((await confirm()).status).toBe(409);
    });

    test('Reservierung abfragen', async () => {
      const res = await request(app).get(`/internal/reservations/${reservationId}`).set(INTERNAL);
      expect(res.body).toMatchObject({ reservationId, status: 'RESERVED', totalAmount: 199.6 });
    });

    test('unbekannte bzw. ungültige ID → 404 bzw. 400', async () => {
      expect((await confirm('00000000-0000-0000-0000-000000000000')).status).toBe(404);
      expect((await confirm('keine-uuid')).status).toBe(400);
    });

    test('Ablauf: abgelaufene Reservierungen werden automatisch freigegeben, bestätigte nicht', async () => {
      const { releaseExpiredReservations } = require('../src/repositories/reservationRepository');
      const otherRes = (await reserve('order-6', [{ eventId, quantity: 2 }])).body.reservationId;
      await confirm(otherRes);
      await pool.query("UPDATE catalog.reservations SET expires_at = now() - interval '1 minute'");

      expect(await releaseExpiredReservations()).toBe(1); // nur die unbezahlte
      expect(await stockOf(eventId)).toBe(8); // 10 - 4 - 2 + 4
      expect(await releaseExpiredReservations()).toBe(0);
    });
  });
});
