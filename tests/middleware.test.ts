import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate, authorize } from '../src/auth/auth.middleware';
import { rateLimiter } from '../src/middleware/rate-limiter';
import { errorHandler } from '../src/middleware/error-handler';
import { config } from '../src/config';
import { getDb } from '../src/database/connection';
import { buildApp, request, tokenFor } from './http-helper';
import { createTestUser, createTestPatient } from './setup';

function mockRes() {
  const res: any = { statusCode: 200, headers: {} as Record<string, unknown> };
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn(() => res);
  res.setHeader = vi.fn((k: string, v: unknown) => { res.headers[k] = v; });
  return res as Response & { headers: Record<string, unknown> };
}
const mockReq = (o: Record<string, unknown> = {}) => ({ headers: {}, ip: '1.1.1.1', ...o } as unknown as Request);

describe('authenticate / authorize', () => {
  const payload = { userId: 1, email: 'a@t.com', role: 'doctor' as const, name: 'A' };

  it('401 sin cabecera, con esquema distinto de Bearer, o token basura', () => {
    for (const headers of [{}, { authorization: 'Basic abc' }, { authorization: 'Bearer basura' }]) {
      const res = mockRes(); const next = vi.fn();
      authenticate(mockReq({ headers }), res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('401 con token expirado o firmado con otro secreto', () => {
    const expired = jwt.sign(payload, config.jwtSecret, { expiresIn: -10 });
    const forged = jwt.sign(payload, 'otro-secreto');
    for (const t of [expired, forged]) {
      const res = mockRes(); const next = vi.fn();
      authenticate(mockReq({ headers: { authorization: `Bearer ${t}` } }), res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('rechaza token con alg=none', () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const t = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...payload, role: 'admin' })}.`;
    const res = mockRes(); const next = vi.fn();
    authenticate(mockReq({ headers: { authorization: `Bearer ${t}` } }), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('token valido rellena req.user y llama a next', () => {
    const req = mockReq({ headers: { authorization: `Bearer ${tokenFor(payload)}` } });
    const next = vi.fn();
    authenticate(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject(payload);
  });

  it('authorize: 401 sin usuario, 403 rol incorrecto, next con rol permitido', () => {
    let res = mockRes(); let next = vi.fn();
    authorize('admin')(mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);

    res = mockRes(); next = vi.fn();
    authorize('admin')(mockReq({ user: payload }), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();

    next = vi.fn();
    authorize('admin', 'doctor')(mockReq({ user: payload }), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

describe('rateLimiter', () => {
  const original = { ...config.rateLimit };
  afterEach(() => {
    config.rateLimit.max = original.max;
    config.rateLimit.windowMs = original.windowMs;
    vi.useRealTimers();
  });

  it('permite hasta max, devuelve 429 despues y expone cabeceras', () => {
    config.rateLimit.max = 3;
    const ip = 'ip-limite-1';
    for (let i = 1; i <= 3; i++) {
      const res = mockRes(); const next = vi.fn();
      rateLimiter(mockReq({ ip }), res, next);
      expect(next).toHaveBeenCalled();
      expect(res.headers['X-RateLimit-Limit']).toBe(3);
      expect(res.headers['X-RateLimit-Remaining']).toBe(3 - i);
    }
    const res = mockRes(); const next = vi.fn();
    rateLimiter(mockReq({ ip }), res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'Too many requests. Please try again later.' });
    expect(next).not.toHaveBeenCalled();
    expect(res.headers['X-RateLimit-Remaining']).toBe(0);
  });

  it('los contadores son independientes por IP', () => {
    config.rateLimit.max = 1;
    const next = vi.fn();
    rateLimiter(mockReq({ ip: 'ip-a' }), mockRes(), next);
    rateLimiter(mockReq({ ip: 'ip-b' }), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('la ventana se reinicia al expirar (reloj simulado)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    config.rateLimit.max = 1;
    config.rateLimit.windowMs = 1000;
    const ip = 'ip-ventana';
    rateLimiter(mockReq({ ip }), mockRes(), vi.fn());
    const blocked = mockRes();
    rateLimiter(mockReq({ ip }), blocked, vi.fn());
    expect(blocked.status).toHaveBeenCalledWith(429);

    vi.setSystemTime(new Date('2030-01-01T00:00:01.500Z'));
    const next = vi.fn();
    rateLimiter(mockReq({ ip }), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

describe('errorHandler', () => {
  const original = config.isDevelopment;
  afterEach(() => { (config as any).isDevelopment = original; });

  it('produccion: 500 generico sin filtrar mensaje ni stack', () => {
    (config as any).isDevelopment = false;
    const res = mockRes();
    errorHandler(new Error('SQLITE_ERROR: no such table users'), mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('produccion: 4xx conserva el mensaje', () => {
    (config as any).isDevelopment = false;
    const res = mockRes();
    errorHandler(Object.assign(new Error('Bad input'), { statusCode: 400 }), mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Bad input' });
  });

  // FIXME documentado en error-handler.ts:16: en desarrollo se filtra stack/mensaje interno
  it.fails('desarrollo: no deberia exponer el stack al cliente', () => {
    (config as any).isDevelopment = true;
    const res = mockRes();
    errorHandler(new Error('SQLITE_ERROR'), mockReq(), res, vi.fn());
    const sent = (res.json as any).mock.calls[0][0];
    expect(sent.stack).toBeUndefined();
  });
});

describe('auditLogger', () => {
  const app = buildApp();
  const auditRows = () => getDb().prepare('SELECT * FROM audit_log ORDER BY id').all() as any[];

  it('registra mutaciones exitosas con el usuario y no registra GET ni errores', async () => {
    const admin = createTestUser({ email: 'a@t.com', password: 'p', role: 'admin', name: 'Admin' });
    const doc = createTestUser({ email: 'd@t.com', password: 'p', role: 'doctor', name: 'Doc' });
    const pat = createTestUser({ email: 'p@t.com', password: 'p', role: 'patient', name: 'Pat' });
    const t = tokenFor({ userId: admin, email: 'a@t.com', role: 'admin', name: 'Admin' });

    await request(app, 'GET', '/api/patients', { token: t });
    expect(auditRows()).toHaveLength(0);

    await request(app, 'POST', '/api/patients', { token: t, body: { user_id: 'x' } }); // 400 -> no se registra
    expect(auditRows()).toHaveLength(0);

    const r = await request(app, 'POST', '/api/patients', {
      token: t, body: { user_id: pat, date_of_birth: '1990-01-01', assigned_doctor_id: doc },
    });
    expect(r.status).toBe(201);
    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(admin);
    expect(rows[0].action).toBe('POST');
    // req.path es relativo al router montado (ver bug de resource mas abajo)
    expect(JSON.parse(rows[0].details).path).toBe('/');
  });

  // BUG: audit-logger.ts:13-14 evalua req.path dentro del router (relativo: '/' o '/5'): resource queda 'unknown' o el id ('5') y resource_id null; deberia usar req.baseUrl/originalUrl
  it.fails('deberia registrar resource="patients" y el resource_id correcto', async () => {
    const admin = createTestUser({ email: 'a@t.com', password: 'p', role: 'admin', name: 'Admin' });
    const pat = createTestUser({ email: 'p@t.com', password: 'p', role: 'patient', name: 'Pat' });
    const pid = createTestPatient({ userId: pat });
    const t = tokenFor({ userId: admin, email: 'a@t.com', role: 'admin', name: 'Admin' });
    await request(app, 'DELETE', `/api/patients/${pid}`, { token: t });
    const [row] = auditRows();
    expect(row.resource).toBe('patients');
    expect(row.resource_id).toBe(pid);
  });

  // BUG (seguridad/compliance): el body completo, incluida la contrasena, se guarda en audit_log (audit-logger.ts:23)
  it.fails('no deberia guardar contrasenas en claro en audit_log al registrar/loguear', async () => {
    await request(app, 'POST', '/api/auth/register', {
      body: { email: 'n@t.com', password: 'SuperSecreta123!', name: 'N', role: 'patient' },
    });
    const dump = JSON.stringify(auditRows());
    expect(dump).not.toContain('SuperSecreta123!');
  });
});
