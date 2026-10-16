import { describe, it, expect } from 'vitest';
import { buildApp, request, tokenFor } from './http-helper';
import { createTestUser, createTestPatient } from './setup';
import {
  getAppointments, getAppointmentById, createAppointment, updateAppointment, cancelAppointment,
} from '../src/appointments/appointments.service';
import { validateCreateAppointment, validateUpdateAppointment } from '../src/appointments/appointments.validation';
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
  const tok = (id: number, role: TokenPayload['role'], name: string) =>
    tokenFor({ userId: id, email: `${name}@t.com`, role, name });
  return {
    admin, docA, docB, uA, uB, patA, patB,
    tAdmin: tok(admin, 'admin', 'a'), tDocA: tok(docA, 'doctor', 'da'), tDocB: tok(docB, 'doctor', 'db'),
    tPatA: tok(uA, 'patient', 'pa'), tPatB: tok(uB, 'patient', 'pb'),
  };
}

const dto = (patient_id: number, doctor_id: number, extra = {}) => ({
  patient_id, doctor_id, date_time: '2030-01-01T10:00', ...extra,
});

describe('appointments validation', () => {
  it('create: campos requeridos', () => {
    expect(validateCreateAppointment({})).toBe('patient_id is required');
    expect(validateCreateAppointment({ patient_id: 1 })).toBe('doctor_id is required');
    expect(validateCreateAppointment({ patient_id: 1, doctor_id: 2 })).toBe('date_time is required');
  });
  it('create: formato de fecha', () => {
    expect(validateCreateAppointment({ ...dto(1, 2), date_time: 'manana' })).toMatch(/ISO 8601/);
    expect(validateCreateAppointment({ ...dto(1, 2), date_time: 20300101 })).toMatch(/ISO 8601/);
  });
  it.each([[4, true], [5, false], [480, false], [481, true], ['abc', true], [-10, true]])(
    'create: duration_minutes %s -> error=%s', (d, hasError) => {
      const r = validateCreateAppointment({ ...dto(1, 2), duration_minutes: d });
      expect(r !== null).toBe(hasError);
    });
  it('update: status invalido y fecha invalida', () => {
    expect(validateUpdateAppointment({ status: 'foo' })).toBe('invalid status');
    expect(validateUpdateAppointment({ date_time: 'x' })).toMatch(/ISO 8601/);
    expect(validateUpdateAppointment({ status: 'confirmed' })).toBeNull();
    expect(validateUpdateAppointment({})).toBeNull();
  });
  // BUG: duration_minutes no se valida en update (appointments.validation.ts:27-38)
  it.fails('update: deberia validar duration_minutes', () => {
    expect(validateUpdateAppointment({ duration_minutes: -5 })).not.toBeNull();
  });
});

describe('appointments service', () => {
  it('createAppointment aplica duracion 30 por defecto y reason null', () => {
    const w = world();
    const a = createAppointment(dto(w.patA, w.docA));
    expect(a.duration_minutes).toBe(30);
    expect(a.status).toBe('scheduled');
    expect(a.reason).toBeNull();
    expect(a.patient_name).toBe('Pat A');
    expect(a.doctor_name).toBe('Doc A');
  });

  it('listados filtrados por rol', () => {
    const w = world();
    createAppointment(dto(w.patA, w.docA));
    createAppointment(dto(w.patB, w.docB));
    const p = (userId: number, role: TokenPayload['role']) => ({ userId, role, email: '', name: '' });
    expect(getAppointments(p(w.admin, 'admin'))).toHaveLength(2);
    expect(getAppointments(p(w.docA, 'doctor'))).toHaveLength(1);
    expect(getAppointments(p(w.uB, 'patient'))).toHaveLength(1);
    expect(getAppointments(p(w.uB, 'patient'))[0].patient_id).toBe(w.patB);
  });

  it('getAppointmentById devuelve null para otro doctor / otro paciente', () => {
    const w = world();
    const a = createAppointment(dto(w.patA, w.docA));
    const p = (userId: number, role: TokenPayload['role']) => ({ userId, role, email: '', name: '' });
    expect(getAppointmentById(a.id, p(w.docB, 'doctor'))).toBeNull();
    expect(getAppointmentById(a.id, p(w.uB, 'patient'))).toBeNull();
    expect(getAppointmentById(a.id, p(w.uA, 'patient'))).not.toBeNull();
    expect(getAppointmentById(9999, p(w.admin, 'admin'))).toBeNull();
  });

  it('updateAppointment sin campos devuelve la cita intacta; con campos actualiza', () => {
    const w = world();
    const a = createAppointment(dto(w.patA, w.docA));
    const admin = { userId: w.admin, role: 'admin' as const, email: '', name: '' };
    expect(updateAppointment(a.id, {}, admin)?.status).toBe('scheduled');
    const u = updateAppointment(a.id, { status: 'confirmed', notes: 'ok', duration_minutes: 45 }, admin)!;
    expect(u).toMatchObject({ status: 'confirmed', notes: 'ok', duration_minutes: 45 });
    expect(updateAppointment(9999, { notes: 'x' }, admin)).toBeNull();
  });

  it('cancelAppointment marca cancelled; inexistente -> false', () => {
    const w = world();
    const a = createAppointment(dto(w.patA, w.docA));
    const admin = { userId: w.admin, role: 'admin' as const, email: '', name: '' };
    expect(cancelAppointment(a.id, admin)).toBe(true);
    expect(getAppointmentById(a.id, admin)?.status).toBe('cancelled');
    expect(cancelAppointment(9999, admin)).toBe(false);
  });
});

describe('API /api/appointments', () => {
  it('401 sin token y con token invalido', async () => {
    expect((await request(app, 'GET', '/api/appointments')).status).toBe(401);
    expect((await request(app, 'GET', '/api/appointments', { token: 'basura' })).status).toBe(401);
    expect((await request(app, 'POST', '/api/appointments', { body: {} })).status).toBe(401);
  });

  it('GET lista con { data, count } segun rol', async () => {
    const w = world();
    createAppointment(dto(w.patA, w.docA));
    createAppointment(dto(w.patB, w.docB));
    const r = await request(app, 'GET', '/api/appointments', { token: w.tDocA });
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(1);
    expect(r.body.data).toHaveLength(1);
    expect((await request(app, 'GET', '/api/appointments', { token: w.tAdmin })).body.count).toBe(2);
  });

  it('POST: 201 admin/doctor, 403 paciente, 400 validacion', async () => {
    const w = world();
    const ok = await request(app, 'POST', '/api/appointments', { token: w.tDocA, body: dto(w.patA, w.docA, { reason: 'Control' }) });
    expect(ok.status).toBe(201);
    expect(ok.body.data.reason).toBe('Control');
    expect((await request(app, 'POST', '/api/appointments', { token: w.tAdmin, body: dto(w.patA, w.docA) })).status).toBe(201);
    expect((await request(app, 'POST', '/api/appointments', { token: w.tPatA, body: dto(w.patA, w.docA) })).status).toBe(403);
    const bad = await request(app, 'POST', '/api/appointments', { token: w.tDocA, body: { patient_id: 1 } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBeTruthy();
  });

  it('POST con JSON malformado -> 400 (error handler)', async () => {
    const w = world();
    const r = await request(app, 'POST', '/api/appointments', { token: w.tDocA, rawBody: '{no-json' });
    expect(r.status).toBe(400);
  });

  // BUG: paciente/doctor inexistente provoca violacion FK -> 500 en vez de 400/404 (appointments.routes.ts:36-39)
  it.fails('POST con patient_id inexistente deberia dar 404/400', async () => {
    const w = world();
    const r = await request(app, 'POST', '/api/appointments', { token: w.tAdmin, body: dto(9999, w.docA) });
    expect([400, 404]).toContain(r.status);
  });

  // BUG (IDOR): un doctor puede crear citas para pacientes de otro doctor y a nombre de otro doctor
  it.fails('POST: un doctor no deberia crear citas para pacientes de otro doctor', async () => {
    const w = world();
    const r = await request(app, 'POST', '/api/appointments', { token: w.tDocA, body: dto(w.patB, w.docB) });
    expect(r.status).toBe(403);
  });

  // BUG: no hay control de solapamiento -> mismo doctor, misma hora; deberia ser 409
  it.fails('POST: doble reserva del mismo doctor y hora deberia dar 409', async () => {
    const w = world();
    await request(app, 'POST', '/api/appointments', { token: w.tAdmin, body: dto(w.patA, w.docA) });
    const r = await request(app, 'POST', '/api/appointments', { token: w.tAdmin, body: dto(w.patB, w.docA) });
    expect(r.status).toBe(409);
  });

  it('GET /:id: 200 propietario, 404 inexistente, 400 id no numerico', async () => {
    const w = world();
    const a = createAppointment(dto(w.patA, w.docA));
    expect((await request(app, 'GET', `/api/appointments/${a.id}`, { token: w.tPatA })).body.data.id).toBe(a.id);
    expect((await request(app, 'GET', '/api/appointments/9999', { token: w.tAdmin })).status).toBe(404);
    expect((await request(app, 'GET', '/api/appointments/abc', { token: w.tAdmin })).status).toBe(400);
  });

  it('GET /:id: IDOR bloqueado (otro paciente y otro doctor reciben 404)', async () => {
    const w = world();
    const a = createAppointment(dto(w.patA, w.docA));
    expect((await request(app, 'GET', `/api/appointments/${a.id}`, { token: w.tPatB })).status).toBe(404);
    expect((await request(app, 'GET', `/api/appointments/${a.id}`, { token: w.tDocB })).status).toBe(404);
  });

  it('PUT: actualiza, 400 status invalido, 404 ajena, 400 id invalido', async () => {
    const w = world();
    const a = createAppointment(dto(w.patA, w.docA));
    const ok = await request(app, 'PUT', `/api/appointments/${a.id}`, { token: w.tDocA, body: { status: 'confirmed' } });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('confirmed');
    expect((await request(app, 'PUT', `/api/appointments/${a.id}`, { token: w.tDocA, body: { status: 'zzz' } })).status).toBe(400);
    expect((await request(app, 'PUT', `/api/appointments/${a.id}`, { token: w.tDocB, body: { status: 'completed' } })).status).toBe(404);
    expect((await request(app, 'PUT', `/api/appointments/${a.id}`, { token: w.tPatB, body: { notes: 'x' } })).status).toBe(404);
    expect((await request(app, 'PUT', '/api/appointments/abc', { token: w.tDocA, body: {} })).status).toBe(400);
  });

  // BUG: un paciente puede marcar su cita como 'completed' o cambiar su fecha (sin restriccion por rol en PUT)
  it.fails('PUT: un paciente no deberia poder marcar su cita como completed', async () => {
    const w = world();
    const a = createAppointment(dto(w.patA, w.docA));
    const r = await request(app, 'PUT', `/api/appointments/${a.id}`, { token: w.tPatA, body: { status: 'completed' } });
    expect(r.status).toBe(403);
  });

  it('DELETE: cancela (soft), mensaje, 404 ajena/inexistente', async () => {
    const w = world();
    const a = createAppointment(dto(w.patA, w.docA));
    expect((await request(app, 'DELETE', `/api/appointments/${a.id}`, { token: w.tPatB })).status).toBe(404);
    const r = await request(app, 'DELETE', `/api/appointments/${a.id}`, { token: w.tPatA });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ message: 'Appointment cancelled' });
    const after = await request(app, 'GET', `/api/appointments/${a.id}`, { token: w.tAdmin });
    expect(after.body.data.status).toBe('cancelled');
    expect((await request(app, 'DELETE', '/api/appointments/9999', { token: w.tAdmin })).status).toBe(404);
    expect((await request(app, 'DELETE', '/api/appointments/x', { token: w.tAdmin })).status).toBe(400);
  });

  // BUG: cancelar una cita ya cancelada/completada devuelve 200 en lugar de 409
  it.fails('DELETE: cancelar una cita ya cancelada deberia dar 409', async () => {
    const w = world();
    const a = createAppointment(dto(w.patA, w.docA));
    await request(app, 'DELETE', `/api/appointments/${a.id}`, { token: w.tAdmin });
    const r = await request(app, 'DELETE', `/api/appointments/${a.id}`, { token: w.tAdmin });
    expect(r.status).toBe(409);
  });
});
