
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'INTERNAL_API_TOKEN'];
const SWEEP_INTERVAL_MS = 60 * 1000;

async function main() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length) {
    console.error(`[catalog] Fehlende Umgebungsvariablen: ${missing.join(', ')}`);
    process.exit(1);
  }

  const { createApp } = require('./app');
  const pool = require('./config/db');
  const { releaseExpiredReservations } = require('./repositories/reservationRepository');

  const app = await createApp();
  const port = Number(process.env.PORT) || 3001;
  const server = app.listen(port, () => console.log(`[catalog] läuft auf Port ${port}`));

  const sweeper = setInterval(async () => {
    try {
      const released = await releaseExpiredReservations();
      if (released > 0) console.log(`[catalog] ${released} abgelaufene Reservierung(en) freigegeben`);
    } catch (err) {
      console.error('[catalog] Freigabe abgelaufener Reservierungen fehlgeschlagen:', err.message);
    }
  }, SWEEP_INTERVAL_MS);

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    console.log('[catalog] Fahre herunter …');
    clearInterval(sweeper);
    server.close(async () => {
      await app.locals.apollo.stop();
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[catalog] Start fehlgeschlagen:', err);
  process.exit(1);
});
