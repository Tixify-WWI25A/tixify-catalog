// Mit KI erstellt (KI-Log Nr. 6), vom Team geprüft.
const { validateEvent, validateReservationItems } = require('../src/validation/eventValidation');
const { HttpError } = require('../src/middleware/errorHandler');

const valid = () => ({
  title: '  Rock am Ring  ',
  location: 'Nürburgring',
  event_date: '2027-06-05T18:00:00Z',
  price: 199.99,
  event_stock: 500
});

// Hilfsfunktion: liefert die Feldfehler einer abgelehnten Eingabe
function errorsOf(input, mode) {
  try {
    validateEvent(input, mode);
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(400);
    return err.details || {};
  }
  throw new Error('Eingabe wurde fälschlich akzeptiert');
}

describe('validateEvent – anlegen', () => {
  test('gültige Eingabe wird bereinigt und mit Standardwerten ergänzt', () => {
    expect(validateEvent(valid(), 'create')).toEqual({
      title: 'Rock am Ring',
      location: 'Nürburgring',
      event_date: '2027-06-05T18:00:00.000Z',
      price: 199.99,
      event_stock: 500,
      description: '',
      category: 'Konzerte',
      address: null,
      latitude: null,
      longitude: null,
      logo_url: null
    });
  });

  test('fehlende Pflichtfelder werden alle gemeldet', () => {
    expect(Object.keys(errorsOf({}, 'create')).sort())
      .toEqual(['event_date', 'event_stock', 'location', 'price', 'title']);
  });

  test.each([
    ['negativer Preis', { price: -1 }, 'price'],
    ['Preis mit drei Nachkommastellen', { price: 9.999 }, 'price'],
    ['Preis als Text', { price: 'abc' }, 'price'],
    ['negativer Bestand', { event_stock: -5 }, 'event_stock'],
    ['Bestand mit Komma', { event_stock: 2.5 }, 'event_stock'],
    ['ungültiges Datum', { event_date: 'morgen' }, 'event_date'],
    ['unbekannte Kategorie', { category: 'Oper' }, 'category'],
    ['Bild-URL mit javascript:', { logo_url: 'javascript:alert(1)' }, 'logo_url'],
    ['Breitengrad außerhalb', { latitude: 91, longitude: 9 }, 'latitude'],
    ['nur Breitengrad', { latitude: 48.7 }, 'latitude'],
    ['zu langer Titel', { title: 'x'.repeat(201) }, 'title']
  ])('%s wird abgelehnt', (_, change, field) => {
    expect(errorsOf({ ...valid(), ...change }, 'create')).toHaveProperty(field);
  });

  test('Grenzwerte: Preis 0 und Bestand 0 sind erlaubt, 19.99 ist exakt zwei Nachkommastellen', () => {
    expect(validateEvent({ ...valid(), price: 0, event_stock: 0 }, 'create')).toMatchObject({ price: 0, event_stock: 0 });
    expect(validateEvent({ ...valid(), price: 19.99 }, 'create').price).toBe(19.99);
  });

  test('Zahlen als Text (aus Formularen) werden umgewandelt', () => {
    expect(validateEvent({ ...valid(), price: '49.90', event_stock: '100' }, 'create'))
      .toMatchObject({ price: 49.9, event_stock: 100 });
  });

  test('unbekannte Felder wie event_id werden ignoriert', () => {
    expect(validateEvent({ ...valid(), event_id: 999, role: 'admin' }, 'create')).not.toHaveProperty('event_id');
  });
});

describe('validateEvent – ändern', () => {
  test('liefert NUR die übergebenen Felder (logo_url bleibt unangetastet)', () => {
    expect(validateEvent({ price: 10 }, 'update')).toEqual({ price: 10 });
  });

  test('null löscht ein optionales Feld bewusst', () => {
    expect(validateEvent({ logo_url: null }, 'update')).toEqual({ logo_url: null });
  });

  test('leeres Update wird abgelehnt', () => {
    expect(() => validateEvent({}, 'update')).toThrow('Keine änderbaren Felder');
  });

  test('Body, der kein Objekt ist, wird abgelehnt', () => {
    expect(() => validateEvent([1, 2], 'update')).toThrow('JSON-Objekt');
  });
});

describe('validateReservationItems', () => {
  test('gültige Positionen', () => {
    expect(validateReservationItems([{ eventId: '3', quantity: 2 }])).toEqual([{ eventId: 3, quantity: 2 }]);
  });

  test.each([
    ['leere Liste', []],
    ['Menge 0', [{ eventId: 1, quantity: 0 }]],
    ['Menge 101', [{ eventId: 1, quantity: 101 }]],
    ['negative Event-ID', [{ eventId: -1, quantity: 1 }]],
    ['doppeltes Event', [{ eventId: 1, quantity: 1 }, { eventId: 1, quantity: 2 }]]
  ])('%s wird abgelehnt', (_, items) => {
    expect(() => validateReservationItems(items)).toThrow(HttpError);
  });
});
