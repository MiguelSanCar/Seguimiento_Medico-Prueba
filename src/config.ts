export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  // FIXME: JWT secret hardcodeado — debe venir de variable de entorno
  // DEBT: mover a process.env.JWT_SECRET y lanzar error si no está definida
  jwtSecret: 'healthtrack-secret-key-2024',
  jwtExpiresIn: 86400, // 24h en segundos
  dbPath: process.env.DB_PATH || 'healthtrack.db',
  bcryptRounds: 10,
  rateLimit: {
    windowMs: 60 * 1000,
    max: 100,
  },
  isDevelopment: process.env.NODE_ENV !== 'production',
};
