import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';
import { config } from '../src/config';
import { auditLogger } from '../src/middleware/audit-logger';
import { errorHandler } from '../src/middleware/error-handler';
import authRoutes from '../src/auth/auth.routes';
import patientsRoutes from '../src/patients/patients.routes';
import appointmentsRoutes from '../src/appointments/appointments.routes';
import metricsRoutes from '../src/health-metrics/metrics.routes';
import notificationsRoutes from '../src/notifications/notifications.routes';
import type { TokenPayload } from '../src/auth/auth.types';

// src/index.ts hace app.listen() al importarse, asi que se monta una app equivalente
// (sin rate limiter global, para que los tests no dependan del contador por IP).
export function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(auditLogger);
  app.use('/api/auth', authRoutes);
  app.use('/api/patients', patientsRoutes);
  app.use('/api/appointments', appointmentsRoutes);
  app.use('/api/health-metrics', metricsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use(errorHandler);
  return app;
}

export function tokenFor(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });
}

export interface ApiResponse {
  status: number;
  body: any;
}

// Node 16 no tiene fetch global ni hay supertest: cliente minimo sobre http.
export async function request(
  app: express.Express,
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; rawBody?: string } = {}
): Promise<ApiResponse> {
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const payload = opts.rawBody ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined);

  try {
    return await new Promise<ApiResponse>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1', port, path, method,
          headers: {
            ...(payload !== undefined ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
            ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
          },
        },
        res => {
          let data = '';
          res.on('data', c => (data += c));
          res.on('end', () => {
            let body: unknown = data;
            try { body = data ? JSON.parse(data) : undefined; } catch { /* no JSON */ }
            resolve({ status: res.statusCode || 0, body });
          });
        }
      );
      req.on('error', reject);
      if (payload !== undefined) req.write(payload);
      req.end();
    });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
