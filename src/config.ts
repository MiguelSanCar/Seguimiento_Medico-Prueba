import { randomBytes } from 'crypto';

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    if (secret.length < 32) {
      throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
    }
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es obligatorio en producción');
  }
  // Desarrollo: secreto aleatorio por proceso (los tokens dejan de ser válidos al reiniciar)
  console.warn('[config] JWT_SECRET no definida: usando un secreto aleatorio temporal');
  return randomBytes(48).toString('hex');
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: 86400, // 24h en segundos
  dbPath: process.env.DB_PATH || 'healthtrack.db',
  bcryptRounds: 10,
  rateLimit: {
    windowMs: 60 * 1000,
    max: 100,
  },
  isDevelopment: process.env.NODE_ENV !== 'production',
};
