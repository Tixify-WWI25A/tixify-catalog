# Tixify catalog-Service

Verwaltet die **Events und Ticketkontingente** von Tixify, stellt sie per **REST und GraphQL** bereit und **reserviert Tickets** für den Checkout, damit nichts doppelt verkauft wird.

Teil der Tixify-Architektur aus drei Backend-Services:

| Repo | Aufgabe | Heroku-App |
|---|---|---|
| tixify-gateway | Eingangstür, Login, Benutzer | `tixify` |
| **tixify-catalog** | **Events, GraphQL, Reservierungen, Adresssuche** | `tixify-catalog` |
| tixify-orders | Warenkorb, PayPal, Bestellungen, Mails | `tixify-orders` |

## Endpunkte

Vollständige Beschreibung: [`docs/openapi.yaml`](docs/openapi.yaml) (z. B. in [editor.swagger.io](https://editor.swagger.io) öffnen).

| Methode | Pfad | Wer | Zweck |
|---|---|---|---|
| GET | `/api/events` | alle | Events suchen und filtern (`search`, `location`, `category`, `maxPrice`, `from`) |
| GET | `/api/events/:id` | alle | Ein Event |
| POST | `/api/events` | Admin | Event anlegen |
| PATCH | `/api/events/:id` | Admin | Nur übergebene Felder ändern |
| DELETE | `/api/events/:id` | Admin | Löschen (409, wenn schon Reservierungen existieren) |
| GET | `/api/geocode?q=` | Admin | Adresssuche über OpenStreetMap, mit Cache |
| POST | `/graphql` | alle / Admin | Gleicher Funktionsumfang wie REST |
| POST | `/internal/reservations` | orders-Service | Tickets reservieren |
| POST | `/internal/reservations/:id/confirm` | orders-Service | Nach Zahlung bestätigen |
| POST | `/internal/reservations/:id/release` | orders-Service | Bei Abbruch freigeben |
| GET | `/health` | alle | Lebenszeichen |

`/internal/...` ist mit dem Header `X-Internal-Token` geschützt und wird vom gateway nie nach außen weitergeleitet.

## Wie die Reservierung Überbuchung verhindert

1. orders schickt `POST /internal/reservations` mit allen Positionen des Warenkorbs.
2. Pro Event verringert **eine einzige SQL-Anweisung** den Bestand, aber nur `WHERE event_stock >= Menge`. Zwei gleichzeitige Käufe können also nie beide das letzte Ticket bekommen.
3. Fehlt bei einer Position Bestand, wird die **ganze** Reservierung zurückgerollt (409, mit verfügbarer Menge).
4. Nach erfolgreicher Zahlung bestätigt orders die Reservierung. Wird nicht bezahlt, gibt der catalog sie nach **15 Minuten** automatisch frei.

Der Test „20 gleichzeitige Käufe um 5 Tickets“ in `tests/reservations.api.test.js` weist das nach.

## Aufbau

Gleiche Grundstruktur wie unser ursprüngliches Backend – **ein Handler pro Anwendungsfall**, Routen als Tabelle –
und in allen drei Backend-Repos gleich aufgebaut:

```
src/
  app.js                       Express-App: Routen-Dateien einhängen, GraphQL
  server.js                    Start, Freigabe abgelaufener Reservierungen, sauberes Herunterfahren
  config/db.js                 Datenbankverbindung (Schema catalog)
  config/graphql.js            GraphQL-Schema und Resolver (gleiche Validierung wie REST)
  middleware/auth.js           checkLogin, requireAdmin, requireInternal (identisch in allen drei Repos)
  middleware/errorHandler.js   HttpError und einheitliche Fehlerantwort
  routes/eventRoutes.js        /api/events          → Get/Create/Update/DeleteEvent…Handler
  routes/geocodeRoutes.js      /api/geocode         → GeocodeHandler
  routes/reservationRoutes.js  /internal/reservations → …ReservationHandler (nur für orders)
  routes/buildRouter.js        baut aus einer Routen-Tabelle den Router
  handlers/                    ein Handler pro Anwendungsfall, z. B. CreateEventHandler.js
  repositories/                einzige Stelle mit SQL
  validation/                  Eingaberegeln (von REST und GraphQL gemeinsam genutzt)
  services/geocodeService.js   Nominatim-Anbindung mit begrenztem Zwischenspeicher
db/
  schema.sql                   Schema "catalog" von Grund auf
  migrations/                  Umzug der bestehenden Heroku-Daten
docs/openapi.yaml              API-Beschreibung (API-first)
```

Neu gegenüber dem ursprünglichen Backend:
- **`repositories/`**: SQL steht an einer Stelle statt in jedem Handler.
- **`middleware/errorHandler.js`**: Handler werfen `HttpError`, die Antwort hat immer das Format `{ error, details? }`.
- **`routes/buildRouter.js`**: die Schleife über die Routen-Tabelle gibt es nur noch einmal – sie übergibt die Middlewares
  wirklich (im alten `eventRoutes.js` fehlte das, Admin-Routen waren ohne Login erreichbar).
- `config/auth.js` und `config/requireAdmin.js` heißen jetzt `middleware/auth.js` (`checkLogin`, `requireAdmin`, `requireInternal`).

## Lokal starten

```bash
npm install
cp .env.example .env        # Werte eintragen
psql "$DATABASE_URL" -f db/schema.sql
node --env-file=.env src/server.js
```

## Tests

```bash
npm test                                                   # nur Tests ohne Datenbank
DATABASE_URL=postgres://postgres:postgres@localhost:5432/tixify_test npm test   # alle Tests
```

Die Datenbank-Tests setzen das Schema `catalog` der angegebenen Datenbank **komplett zurück**. Niemals mit der Produktionsdatenbank ausführen.

Die CI (`.github/workflows/ci.yml`) startet bei jedem Push eine eigene PostgreSQL-Instanz und führt alle Tests aus.

## Deployment (Heroku)

1. Datenbank-Backup: `heroku pg:backups:capture -a tixify`
2. Migration ausführen: `heroku pg:psql -a tixify < db/migrations/001_move_events_to_catalog.sql`, danach `heroku restart -a tixify`
3. Datenbank teilen: `heroku addons:attach tixify::DATABASE --as DATABASE -a tixify-catalog`
4. Variablen setzen: `heroku config:set JWT_SECRET=... INTERNAL_API_TOKEN=... NOMINATIM_CONTACT=... -a tixify-catalog`
5. Im Heroku-Dashboard unter *Deploy* dieses GitHub-Repo verbinden und *Automatic deploys* aktivieren.

## KI-Einsatz

Architektur-Grundlage und Grundstruktur (ein Handler pro Anwendungsfall, Routen als Tabelle) stammen aus unserem
ursprünglichen Backend. Die Aufteilung in drei Services, die Sicherheitskorrekturen, die Tests und die neuen Bausteine
wurden mit KI-Unterstützung (Claude) erstellt und vom Team geprüft. Jede Datei sagt im Kopfkommentar, worauf sie
basiert und was mit KI geändert oder neu erstellt wurde, und verweist auf die Nummer im KI-Log.
