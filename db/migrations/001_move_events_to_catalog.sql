-- Mit KI erstellt (KI-Log Nr. 6), vom Team geprüft.
-- Migration 001: Event-Tabelle aus dem gemeinsamen "public"-Schema in das Schema "catalog" verschieben
--
-- VORHER (Owner der Heroku-App):
--   heroku pg:backups:capture -a tixify
-- AUSFÜHREN:
--   heroku pg:psql -a tixify < db/migrations/001_move_events_to_catalog.sql
-- DANACH:
--   heroku restart -a tixify   (damit das alte Backend den neuen search_path übernimmt)
--
-- Läuft komplett in einer Transaktion: Schlägt ein Schritt fehl, bleibt alles wie vorher.

BEGIN;

CREATE SCHEMA IF NOT EXISTS catalog;

-- 1. Tabelle verschieben. Daten, IDs und bestehende Fremdschlüssel (z. B. von tickets)
--    bleiben erhalten, weil PostgreSQL die Tabelle nur umhängt, nicht kopiert.
ALTER TABLE public.events SET SCHEMA catalog;

-- 2. Spalten, die das alte Backend nachträglich ergänzt hat, sicherstellen
ALTER TABLE catalog.events ADD COLUMN IF NOT EXISTS category  VARCHAR(50) NOT NULL DEFAULT 'Konzerte';
ALTER TABLE catalog.events ADD COLUMN IF NOT EXISTS address   VARCHAR(300);
ALTER TABLE catalog.events ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9, 6);
ALTER TABLE catalog.events ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6);

-- 3. Regeln, die bisher nur (lückenhaft) im Code standen, in der Datenbank absichern.
--    Schlägt das fehl, gibt es bereits Events mit negativem Preis oder Bestand:
--    diese erst korrigieren, dann die Migration erneut ausführen.
ALTER TABLE catalog.events ADD CONSTRAINT events_price_not_negative CHECK (price >= 0);
ALTER TABLE catalog.events ADD CONSTRAINT events_stock_not_negative CHECK (event_stock >= 0);

-- 4. Reservierungen (neu)
CREATE TABLE IF NOT EXISTS catalog.reservations (
  reservation_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_ref      VARCHAR(100) NOT NULL UNIQUE,
  status         VARCHAR(20)  NOT NULL DEFAULT 'RESERVED',
  expires_at     TIMESTAMPTZ  NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT reservations_status_valid CHECK (status IN ('RESERVED', 'CONFIRMED', 'RELEASED'))
);

CREATE TABLE IF NOT EXISTS catalog.reservation_items (
  reservation_id UUID    NOT NULL REFERENCES catalog.reservations (reservation_id) ON DELETE CASCADE,
  event_id       INTEGER NOT NULL REFERENCES catalog.events (event_id),
  quantity       INTEGER NOT NULL,
  PRIMARY KEY (reservation_id, event_id),
  CONSTRAINT reservation_items_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS reservations_open_expiry
  ON catalog.reservations (expires_at) WHERE status = 'RESERVED';

-- 5. Übergangslösung: Das alte Backend fragt "events" ohne Schema-Namen ab.
--    Mit diesem Suchpfad findet es die Tabelle weiterhin, bis es abgelöst ist.
--    Gilt für neue Verbindungen, deshalb danach "heroku restart -a tixify".
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path = catalog, identity, orders, public', current_database());
END $$;

COMMIT;
