import { describe, it, expect } from 'vitest';
import { buildApp, request, tokenFor } from './http-helper';
import { createTestUser, createTestPatient } from './setup';
import { createMetric } from '../src/health-metrics/metrics.service';
import { createNotification, getUnreadCount, getNotificationsForUser, markAsRead } from '../src/notifications/notifications.service';
import type { TokenPayload } from '../src/auth/auth.types';

const app = buildApp();

function world() {
  const admin = createTestUser({ email: 'a@t.com', password: 'p', role: 'admin', name: 'Admin' });
  const docA = createTestUser({ email: 'da@t.com', password: 'p', role: 'doctor', name: 'Doc A' });
  const docB = createTestUser({ email: 'db@t.com', password: 'p', role: 'doctor', name: 'Doc B' });
  const uA = createTestUser({ email: 'pa@t.com', password: 'p', role: 'patient', name: 'Pat A' });
  const uB = createTestUser({ email: 'pb@t.com', password: 'p', role: 'patient', name: 'Pat B' });
  const patA = createTestPatient({ userId: uA, doctorId: docA });
  const patB = createTestPatient({ userId: uB, doctorId: docB });
  const tok = (id: number, role: TokenPayload['role']) => tokenFor({ userId: id, email: 'x@t.com', role, name: 'x' });
  const pl = (userId: number, role: TokenPayload['role']): TokenPayload => ({ userId, role, email: '', name: '' });
  return {
    admin, docA, docB, uA, uB, patA, patB, pl,
    tAdmin: tok(admin, 'admin'), tDocA: tok(docA, 'doctor'), tDocB: tok(docB, 'doctor'),
    tPatA: tok(uA, 'patient'), tPatB: tok(uB, 'patient'),
  };
}

const body = (patient_id: number, extra = {}) => ({
  patient_id, metric_type: 'glucose', value: 90, unit: 'mg/dL', recorded_at: '2024-01-01T10:00:00Z', ...extra,
});

describe('API /api/health-metrics', () => {
  it('401 sin token en todas las rutas', async () => {
    expect((await request(app, 'GET', '/api/health-metrics/1')).status).toBe(401);
    expect((await request(app, 'GET', '/api/health-metrics/1/summary')).status).toBe(401);
    expect((await request(app, 'POST', '/api/health-metrics', { body: body(1) })).status).toBe(401);
  });

  it('POST 201 + { data }, genera notificacion en anomalia', async () => {
    const w = world();
    const r = await request(app, 'POST', '/api/health-metrics', { token: w.tDocA, body: body(w.patA, { value: 130 }) });
    expect(r.status).toBe(201);
    expect(r.body.data.value).toBe(130);
    expect(getNotificationsForUser(w.pl(w.docA, 'doctor'))).toHaveLength(1);
  });

  it('POST 400 en validacion', async () => {
    const w = world();
    const r = await request(app, 'POST', '/api/health-metrics', { token: w.tDocA, body: body(w.patA, { value: 'abc' }) });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'value must be a number' });
  });

  it('GET lista con { data, count } y filtros', async () => {
    const w = world();
    createMetric({ ...body(w.patA), metric_type: 'glucose' } as any, w.docA);
    createMetric({ ...body(w.patA), metric_type: 'weight', unit: 'kg', value: 70 } as any, w.docA);
    const all = await request(app, 'GET', `/api/health-metrics/${w.patA}`, { token: w.tDocA });
    expect(all.body.count).toBe(2);
    const f = await request(app, 'GET', `/api/health-metrics/${w.patA}?type=weight`, { token: w.tDocA });
    expect(f.body.count).toBe(1);
  });

  it('GET 400 con patientId no numerico; summary devuelve { data }', async () => {
    const w = world();
    expect((await request(app, 'GET', '/api/health-metrics/abc', { token: w.tAdmin })).status).toBe(400);
    expect((await request(app, 'GET', '/api/health-metrics/abc/summary', { token: w.tAdmin })).status).toBe(400);
    createMetric(body(w.patA) as any, w.docA);
    const s = await request(app, 'GET', `/api/health-metrics/${w.patA}/summary`, { token: w.tPatA });
    expect(s.status).toBe(200);
    expect(s.body.data[0].metric_type).toBe('glucose');
  });

  it('POST con paciente inexistente no crea la metrica (error de servidor controlado)', async () => {
    const w = world();
    const r = await request(app, 'POST', '/api/health-metrics', { token: w.tDocA, body: body(9999) });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body.error).toBeTruthy();
  });

  // Control de acceso: 404 sin distinguir paciente inexistente de sin acceso
  it('GET: un paciente no ve metricas de otro paciente (404)', async () => {
    const w = world();
    createMetric(body(w.patB) as any, w.docB);
    const r = await request(app, 'GET', `/api/health-metrics/${w.patB}`, { token: w.tPatA });
    expect(r.status).toBe(404);
  });
  it('GET: un doctor no ve metricas de pacientes de otro doctor (404)', async () => {
    const w = world();
    createMetric(body(w.patB) as any, w.docB);
    const r = await request(app, 'GET', `/api/health-metrics/${w.patB}`, { token: w.tDocA });
    expect(r.status).toBe(404);
  });
  it('GET summary: un paciente no ve el resumen de otro paciente (404)', async () => {
    const w = world();
    createMetric(body(w.patB) as any, w.docB);
    const r = await request(app, 'GET', `/api/health-metrics/${w.patB}/summary`, { token: w.tPatA });
    expect(r.status).toBe(404);
  });
  it('POST: un paciente no registra metricas en otro paciente (404) y no se crea nada', async () => {
    const w = world();
    const r = await request(app, 'POST', '/api/health-metrics', { token: w.tPatA, body: body(w.patB) });
    expect(r.status).toBe(404);
    const n = await request(app, 'GET', `/api/health-metrics/${w.patB}`, { token: w.tAdmin });
    expect(n.body.count).toBe(0);
  });
  it('POST: un paciente si puede registrar sus propias metricas', async () => {
    const w = world();
    const r = await request(app, 'POST', '/api/health-metrics', { token: w.tPatA, body: body(w.patA) });
    expect(r.status).toBe(201);
  });
  it('POST: un doctor no registra metricas en pacientes de otro doctor (404)', async () => {
    const w = world();
    const r = await request(app, 'POST', '/api/health-metrics', { token: w.tDocA, body: body(w.patB) });
    expect(r.status).toBe(404);
  });
  it('POST: paciente inexistente devuelve 404', async () => {
    const w = world();
    const r = await request(app, 'POST', '/api/health-metrics', { token: w.tDocA, body: body(9999) });
    expect(r.status).toBe(404);
  });
});

describe('notifications service', () => {
  const n = (patient_id: number, extra = {}) => ({
    patient_id, type: 'general' as const, title: 't', message: 'm', severity: 'info' as const, ...extra,
  });

  it('createNotification: valores por defecto', () => {
    const w = world();
    const c = createNotification(n(w.patA));
    expect(c.read).toBe(0);
    expect(c.related_metric_id).toBeNull();
  });

  it('listado y contador por rol', () => {
    const w = world();
    createNotification(n(w.patA));
    createNotification(n(w.patA));
    createNotification(n(w.patB));
    expect(getNotificationsForUser(w.pl(w.admin, 'admin'))).toHaveLength(3);
    expect(getNotificationsForUser(w.pl(w.docA, 'doctor'))).toHaveLength(2);
    expect(getNotificationsForUser(w.pl(w.uB, 'patient'))).toHaveLength(1);
    expect(getUnreadCount(w.pl(w.admin, 'admin'))).toBe(3);
    expect(getUnreadCount(w.pl(w.docB, 'doctor'))).toBe(1);
    expect(getUnreadCount(w.pl(w.uA, 'patient'))).toBe(2);
  });

  it('limita a 100 notificaciones', () => {
    const w = world();
    for (let i = 0; i < 105; i++) createNotification(n(w.patA));
    expect(getNotificationsForUser(w.pl(w.admin, 'admin'))).toHaveLength(100);
    expect(getUnreadCount(w.pl(w.admin, 'admin'))).toBe(105);
  });

  it('markAsRead respeta propiedad y reduce el contador', () => {
    const w = world();
    const c = createNotification(n(w.patA));
    expect(markAsRead(c.id, w.pl(w.docB, 'doctor'))).toBe(false);
    expect(markAsRead(c.id, w.pl(w.uB, 'patient'))).toBe(false);
    expect(getUnreadCount(w.pl(w.admin, 'admin'))).toBe(1);
    expect(markAsRead(c.id, w.pl(w.uA, 'patient'))).toBe(true);
    expect(getUnreadCount(w.pl(w.admin, 'admin'))).toBe(0);
    expect(markAsRead(9999, w.pl(w.admin, 'admin'))).toBe(false);
  });
});

describe('API /api/notifications', () => {
  const n = (patient_id: number) => ({
    patient_id, type: 'general' as const, title: 't', message: 'm', severity: 'info' as const,
  });

  it('401 sin token', async () => {
    expect((await request(app, 'GET', '/api/notifications')).status).toBe(401);
    expect((await request(app, 'GET', '/api/notifications/unread-count')).status).toBe(401);
    expect((await request(app, 'PATCH', '/api/notifications/1/read')).status).toBe(401);
  });

  it('GET lista { data, count } filtrada por rol; unread-count { count }', async () => {
    const w = world();
    createNotification(n(w.patA));
    createNotification(n(w.patB));
    const r = await request(app, 'GET', '/api/notifications', { token: w.tDocA });
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(1);
    expect(r.body.data[0].patient_name).toBe('Pat A');
    expect((await request(app, 'GET', '/api/notifications/unread-count', { token: w.tAdmin })).body).toEqual({ count: 2 });
  });

  it('PATCH /:id/read: 200, 404 ajena (IDOR), 404 inexistente, 400 id invalido', async () => {
    const w = world();
    const c = createNotification(n(w.patA));
    expect((await request(app, 'PATCH', `/api/notifications/${c.id}/read`, { token: w.tPatB })).status).toBe(404);
    expect((await request(app, 'PATCH', `/api/notifications/${c.id}/read`, { token: w.tDocB })).status).toBe(404);
    const ok = await request(app, 'PATCH', `/api/notifications/${c.id}/read`, { token: w.tPatA });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ message: 'Marked as read' });
    expect((await request(app, 'PATCH', '/api/notifications/9999/read', { token: w.tAdmin })).status).toBe(404);
    expect((await request(app, 'PATCH', '/api/notifications/abc/read', { token: w.tAdmin })).status).toBe(400);
  });
});
