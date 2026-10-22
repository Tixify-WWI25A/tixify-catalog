-- Mit KI erstellt (KI-Log Nr. 6), vom Team geprüft.
-- Tixify catalog-Service: vollständiges Schema
-- Baut den Datenbereich des catalog-Service von Grund auf (z. B. lokal oder in der CI).
-- Für die bestehende Heroku-Datenbank stattdessen db/migrations/001_move_events_to_catalog.sql ausführen.
--
-- Regel: Nur der catalog-Service liest und schreibt in diesem Schema.

CREATE SCHEMA IF NOT EXISTS catalog;

CREATE TABLE IF NOT EXISTS catalog.events (
  event_id     SERIAL PRIMARY KEY,
  title        VARCHAR(200)   NOT NULL,
  description  TEXT           NOT NULL DEFAULT '',
  category     VARCHAR(50)    NOT NULL DEFAULT 'Konzerte',
  location     VARCHAR(200)   NOT NULL,
  address      VARCHAR(300),
  latitude     NUMERIC(9, 6),
  longitude    NUMERIC(9, 6),
  event_date   TIMESTAMPTZ    NOT NULL,
  price        NUMERIC(10, 2) NOT NULL,
  event_stock  INTEGER        NOT NULL,
  logo_url     TEXT,
  CONSTRAINT events_price_not_negative CHECK (price >= 0),
  CONSTRAINT events_stock_not_negative CHECK (event_stock >= 0)
);

-- Reservierungen: Tickets werden beim Checkout reserviert (Bestand sofort verringert),
-- nach erfolgreicher Zahlung bestätigt oder bei Abbruch/Ablauf wieder freigegeben.
CREATE TABLE IF NOT EXISTS catalog.reservations (
  reservation_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_ref      VARCHAR(100) NOT NULL UNIQUE,  -- Bestell-Referenz des orders-Service (Idempotenz)
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
