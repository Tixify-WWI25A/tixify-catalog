// Mit KI erstellt (KI-Log Nr. 6), vom Team geprüft.
// Wird vor jeder Testdatei geladen (jest.setupFiles). Feste Test-Geheimnisse, nie echte Werte.
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.INTERNAL_API_TOKEN = 'test-internal-token';
process.env.NODE_ENV = 'test';
process.env.RESERVATION_TTL_MINUTES = '15';
