// Mit KI erstellt (KI-Log Nr. 6), vom Team geprüft.
const { searchAddress, clearCache, MAX_ENTRIES } = require('../src/services/geocodeService');
const { HttpError } = require('../src/middleware/errorHandler');

const okResponse = (data) => ({ ok: true, status: 200, json: async () => data });
const place = { display_name: 'Stuttgart Hauptbahnhof', lat: '48.784', lon: '9.181', osm_id: 1, importance: 0.9 };

describe('Adresssuche (Nominatim)', () => {
  beforeEach(() => clearCache());

  test('liefert nur die benötigten Felder', async () => {
    const fetch = jest.fn().mockResolvedValue(okResponse([place]));
    expect(await searchAddress('Stuttgart Hbf', fetch)).toEqual([
      { display_name: 'Stuttgart Hauptbahnhof', lat: '48.784', lon: '9.181' }
    ]);
  });

  test('zweite gleiche Anfrage kommt aus dem Cache (Groß-/Kleinschreibung egal)', async () => {
    const fetch = jest.fn().mockResolvedValue(okResponse([place]));
    await searchAddress('Stuttgart Hbf', fetch);
    await searchAddress('  stuttgart hbf ', fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('Cache ist begrenzt: der älteste Eintrag fliegt raus', async () => {
    const fetch = jest.fn().mockResolvedValue(okResponse([]));
    for (let i = 0; i <= MAX_ENTRIES; i++) await searchAddress(`Ort Nummer ${i}`, fetch);
    await searchAddress('Ort Nummer 0', fetch); // war der älteste → muss neu geladen werden
    await searchAddress(`Ort Nummer ${MAX_ENTRIES}`, fetch); // ist noch im Cache
    expect(fetch).toHaveBeenCalledTimes(MAX_ENTRIES + 2);
  });

  test('weniger als 3 Zeichen → leere Liste ohne Anfrage', async () => {
    const fetch = jest.fn();
    expect(await searchAddress('St', fetch)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('Nominatim nicht erreichbar → 503 mit verständlicher Meldung', async () => {
    const fetch = jest.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'TimeoutError' }));
    await expect(searchAddress('Stuttgart', fetch)).rejects.toMatchObject({ status: 503 });
  });

  test('Nominatim drosselt (429) → 503, Fehler wird nicht gecacht', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce(okResponse([place]));
    await expect(searchAddress('Stuttgart', fetch)).rejects.toBeInstanceOf(HttpError);
    expect(await searchAddress('Stuttgart', fetch)).toHaveLength(1);
  });

  test('sendet einen User-Agent und bricht nach einem Timeout ab', async () => {
    const fetch = jest.fn().mockResolvedValue(okResponse([]));
    await searchAddress('Stuttgart', fetch);
    const options = fetch.mock.calls[0][1];
    expect(options.headers['User-Agent']).toMatch(/^TixifyCatalog/);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
