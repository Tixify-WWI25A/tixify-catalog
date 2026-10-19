// Mit KI erstellt (KI-Log Nr. 6), vom Team geprüft.
const pool = require('../config/db');
const { HttpError } = require('../middleware/errorHandler');

/**
 * Reservierungen sichern Tickets für eine Bestellung, BEVOR der Kunde bezahlt.
 *
 * Ablauf (vom orders-Service gesteuert):
 *   reserve  → Bestand sinkt sofort, Status RESERVED, läuft nach RESERVATION_TTL_MINUTES ab
 *   confirm  → Zahlung erfolgreich, Status CONFIRMED (Bestand bleibt verringert)
 *   release  → Abbruch oder Ablauf, Status RELEASED (Bestand wird zurückgegeben)
 *
 * Schutz vor Überbuchung: Der Bestand wird mit "event_stock >= Menge" in DERSELBEN
 * UPDATE-Anweisung geprüft und verringert. Zwei gleichzeitige Käufe können also nie
 * beide das letzte Ticket bekommen – die Datenbank sperrt die Zeile für die Dauer der Anweisung.
 */

const TTL_MINUTES = () => Number(process.env.RESERVATION_TTL_MINUTES) || 15;

async function loadReservation(client, reservationId) {
  const { rows } = await client.query(
    `SELECT r.reservation_id, r.order_ref, r.status, r.expires_at,
            ri.event_id, ri.quantity, e.title, e.price
       FROM reservations r
       JOIN reservation_items ri ON ri.reservation_id = r.reservation_id
       JOIN events e ON e.event_id = ri.event_id
      WHERE r.reservation_id = $1
      ORDER BY ri.event_id`,
    [reservationId]
  );
  if (rows.length === 0) return null;
  const items = rows.map((r) => ({
    eventId: r.event_id,
    quantity: r.quantity,
    title: r.title,
    unitPrice: Number(r.price)
  }));
  return {
    reservationId: rows[0].reservation_id,
    orderRef: rows[0].order_ref,
    status: rows[0].status,
    expiresAt: rows[0].expires_at.toISOString(),
    items,
    // Gesamtbetrag aus den Preisen des catalog – der orders-Service übernimmt ihn, statt selbst zu rechnen
    totalAmount: items.reduce((sum, i) => sum + Math.round(i.unitPrice * 100) * i.quantity, 0) / 100
  };
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reserviert alle Positionen oder keine (eine Transaktion).
 * Idempotent: Wird dieselbe orderRef erneut geschickt (z. B. nach einem Timeout im orders-Service),
 * kommt die bestehende Reservierung zurück, statt doppelt Bestand abzuziehen.
 * @returns {{ created: boolean, reservation: object }}
 */
async function createReservation(orderRef, items) {
  return withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO reservations (order_ref, expires_at)
       VALUES ($1, now() + make_interval(mins => $2))
       ON CONFLICT (order_ref) DO NOTHING
       RETURNING reservation_id`,
      [orderRef, TTL_MINUTES()]
    );

    if (inserted.rows.length === 0) {
      const existing = await client.query('SELECT reservation_id FROM reservations WHERE order_ref = $1', [orderRef]);
      return { created: false, reservation: await loadReservation(client, existing.rows[0].reservation_id) };
    }

    const reservationId = inserted.rows[0].reservation_id;

    // Immer in derselben Reihenfolge (nach eventId) sperren – verhindert Deadlocks bei parallelen Käufen
    for (const { eventId, quantity } of [...items].sort((a, b) => a.eventId - b.eventId)) {
      const updated = await client.query(
        `UPDATE events SET event_stock = event_stock - $1
          WHERE event_id = $2 AND event_stock >= $1
          RETURNING event_id`,
        [quantity, eventId]
      );

      if (updated.rows.length === 0) {
        const { rows } = await client.query('SELECT title, event_stock FROM events WHERE event_id = $1', [eventId]);
        if (rows.length === 0) throw new HttpError(404, `Event ${eventId} existiert nicht.`);
        // Fehler wirft die ganze Transaktion zurück: auch bereits reservierte Positionen werden freigegeben
        throw new HttpError(409, `Nicht genug Tickets für „${rows[0].title}“.`, {
          eventId, requested: quantity, available: rows[0].event_stock
        });
      }

      await client.query(
        'INSERT INTO reservation_items (reservation_id, event_id, quantity) VALUES ($1, $2, $3)',
        [reservationId, eventId, quantity]
      );
    }

    return { created: true, reservation: await loadReservation(client, reservationId) };
  });
}

async function getReservation(reservationId) {
  const client = await pool.connect();
  try {
    return await loadReservation(client, reservationId);
  } finally {
    client.release();
  }
}

/** Zahlung erfolgreich: Reservierung wird endgültig. Mehrfach aufrufbar (idempotent). */
async function confirmReservation(reservationId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT status FROM reservations WHERE reservation_id = $1 FOR UPDATE', [reservationId]
    );
    if (rows.length === 0) throw new HttpError(404, 'Reservierung nicht gefunden.');
    if (rows[0].status === 'RELEASED') {
      throw new HttpError(409, 'Reservierung ist abgelaufen oder storniert, die Tickets sind nicht mehr gesichert.');
    }
    if (rows[0].status === 'RESERVED') {
      await client.query(
        "UPDATE reservations SET status = 'CONFIRMED', updated_at = now() WHERE reservation_id = $1", [reservationId]
      );
    }
    return loadReservation(client, reservationId);
  });
}

/** Gibt den Bestand zurück. Mehrfach aufrufbar; eine bestätigte Reservierung kann nicht freigegeben werden. */
async function releaseReservation(reservationId, client = null) {
  const run = async (c) => {
    const { rows } = await c.query(
      'SELECT status FROM reservations WHERE reservation_id = $1 FOR UPDATE', [reservationId]
    );
    if (rows.length === 0) throw new HttpError(404, 'Reservierung nicht gefunden.');
    if (rows[0].status === 'CONFIRMED') {
      throw new HttpError(409, 'Reservierung ist bereits bezahlt und kann nicht freigegeben werden.');
    }
    if (rows[0].status === 'RESERVED') {
      await c.query(
        `UPDATE events e SET event_stock = e.event_stock + ri.quantity
           FROM reservation_items ri
          WHERE ri.reservation_id = $1 AND ri.event_id = e.event_id`,
        [reservationId]
      );
      await c.query(
        "UPDATE reservations SET status = 'RELEASED', updated_at = now() WHERE reservation_id = $1", [reservationId]
      );
    }
    return loadReservation(c, reservationId);
  };
  return client ? run(client) : withTransaction(run);
}

/**
 * Gibt alle abgelaufenen, nicht bezahlten Reservierungen frei. Läuft regelmäßig im Server.
 * SKIP LOCKED: Laufen mehrere catalog-Instanzen, bearbeitet jede andere Reservierungen.
 * @returns {number} Anzahl freigegebener Reservierungen
 */
async function releaseExpiredReservations(limit = 50) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT reservation_id FROM reservations
        WHERE status = 'RESERVED' AND expires_at < now()
        ORDER BY expires_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [limit]
    );
    for (const { reservation_id: id } of rows) {
      await releaseReservation(id, client);
    }
    return rows.length;
  });
}

module.exports = {
  createReservation, getReservation, confirmReservation, releaseReservation, releaseExpiredReservations
};
