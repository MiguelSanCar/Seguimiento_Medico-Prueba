import { describe, it, expect } from 'vitest';
import { buildApp, request, tokenFor } from './http-helper';
import { createTestUser, createTestPatient } from './setup';
import { getPatientById, updatePatient } from '../src/patients/patients.service';
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
  return {
    admin, docA, docB, uA, uB, patA, patB,
    tAdmin: tok(admin, 'admin'), tDocA: tok(docA, 'doctor'), tDocB: tok(docB, 'doctor'),
    tPatA: tok(uA, 'patient'), tPatB: tok(uB, 'patient'),
  };
}

describe('API /api/patients: control de acceso', () => {
  it('401 sin token', async () => {
    expect((await request(app, 'GET', '/api/patients')).status).toBe(401);
    expect((await request(app, 'GET', '/api/patients/1')).status).toBe(401);
    expect((await request(app, 'DELETE', '/api/patients/1')).status).toBe(401);
  });

  it('GET lista filtrada por rol con { data, count }', async () => {
    const w = world();
    expect((await request(app, 'GET', '/api/patients', { token: w.tAdmin })).body.count).toBe(2);
    const d = await request(app, 'GET', '/api/patients', { token: w.tDocA });
    expect(d.body.count).toBe(1);
    expect(d.body.data[0].id).toBe(w.patA);
    expect((await request(app, 'GET', '/api/patients', { token: w.tPatB })).body.data[0].id).toBe(w.patB);
  });

  it('GET /:id: 404 inexistente, 400 no numerico, paciente ajeno -> 404', async () => {
    const w = world();
    expect((await request(app, 'GET', '/api/patients/9999', { token: w.tAdmin })).status).toBe(404);
    expect((await request(app, 'GET', '/api/patients/abc', { token: w.tAdmin })).status).toBe(400);
    expect((await request(app, 'GET', `/api/patients/${w.patB}`, { token: w.tPatA })).status).toBe(404);
    expect((await request(app, 'GET', `/api/patients/${w.patA}`, { token: w.tPatA })).status).toBe(200);
  });

  it('POST: 403 paciente, 400 validacion, 201 doctor/admin', async () => {
    const w = world();
    const u = createTestUser({ email: 'n@t.com', password: 'p', role: 'patient', name: 'N' });
    const good = { user_id: u, date_of_birth: '2000-02-02', gender: 'female', blood_type: 'O+' };
    expect((await request(app, 'POST', '/api/patients', { token: w.tPatA, body: good })).status).toBe(403);
    expect((await request(app, 'POST', '/api/patients', { token: w.tDocA, body: { ...good, blood_type: 'Z' } })).status).toBe(400);
    expect((await request(app, 'POST', '/api/patients', { token: w.tDocA, body: { ...good, date_of_birth: '02/02/2000' } })).status).toBe(400);
    expect((await request(app, 'POST', '/api/patients', { token: w.tDocA, body: { ...good, gender: 'x' } })).status).toBe(400);
    expect((await request(app, 'POST', '/api/patients', { token: w.tDocA, body: good })).status).toBe(201);
  });

  it('POST con user_id inexistente no crea paciente (error)', async () => {
    const w = world();
    const r = await request(app, 'POST', '/api/patients', { token: w.tAdmin, body: { user_id: 9999, date_of_birth: '2000-01-01' } });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('PUT: 403 paciente, 404 inexistente, 400 validacion, 200 admin', async () => {
    const w = world();
    expect((await request(app, 'PUT', `/api/patients/${w.patA}`, { token: w.tPatA, body: { blood_type: 'B+' } })).status).toBe(403);
    expect((await request(app, 'PUT', '/api/patients/9999', { token: w.tAdmin, body: {} })).status).toBe(404);
    expect((await request(app, 'PUT', `/api/patients/${w.patA}`, { token: w.tAdmin, body: { blood_type: 'Q' } })).status).toBe(400);
    const ok = await request(app, 'PUT', `/api/patients/${w.patA}`, { token: w.tAdmin, body: { blood_type: 'B+', allergies: ['Nuez'] } });
    expect(ok.status).toBe(200);
    expect(ok.body.data.blood_type).toBe('B+');
  });

  it('DELETE: solo admin (403 doctor y paciente), 404 inexistente, mensaje', async () => {
    const w = world();
    expect((await request(app, 'DELETE', `/api/patients/${w.patA}`, { token: w.tDocA })).status).toBe(403);
    expect((await request(app, 'DELETE', `/api/patients/${w.patA}`, { token: w.tPatA })).status).toBe(403);
    expect((await request(app, 'DELETE', '/api/patients/9999', { token: w.tAdmin })).status).toBe(404);
    const r = await request(app, 'DELETE', `/api/patients/${w.patA}`, { token: w.tAdmin });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ message: 'Patient deleted' });
  });

  it('DELETE de paciente con citas/metricas viola FK y no lo borra (hoy: 500)', async () => {
    const w = world();
    const { createAppointment } = await import('../src/appointments/appointments.service');
    createAppointment({ patient_id: w.patA, doctor_id: w.docA, date_time: '2030-01-01T10:00' });
    const r = await request(app, 'DELETE', `/api/patients/${w.patA}`, { token: w.tAdmin });
    expect(r.status).toBe(500);
    expect((await request(app, 'GET', `/api/patients/${w.patA}`, { token: w.tAdmin })).status).toBe(200);
  });

  it('SQL injection en parametros de ruta no devuelve datos', async () => {
    const w = world();
    const r = await request(app, 'GET', `/api/patients/${encodeURIComponent("1 OR 1=1")}`, { token: w.tPatA });
    // parseInt('1 OR 1=1') = 1: se trata como id=1, no como SQL
    expect([200, 404]).toContain(r.status);
  });

  // BUG (FIXME patients.service.ts:51): un doctor ve pacientes de otro doctor
  it.fails('GET /:id: un doctor no deberia ver pacientes de otro doctor', async () => {
    const w = world();
    const r = await request(app, 'GET', `/api/patients/${w.patB}`, { token: w.tDocA });
    expect(r.status).toBe(404);
  });
  it.fails('servicio getPatientById: doctor ajeno recibe null', () => {
    const w = world();
    expect(getPatientById(w.patB, { userId: w.docA, role: 'doctor', email: '', name: '' })).toBeNull();
  });
  // BUG: PUT /patients/:id no filtra por doctor asignado (patients.routes.ts:49 / updatePatient sin user)
  it.fails('PUT: un doctor no deberia modificar pacientes de otro doctor', async () => {
    const w = world();
    const r = await request(app, 'PUT', `/api/patients/${w.patB}`, { token: w.tDocA, body: { blood_type: 'AB-' } });
    expect([403, 404]).toContain(r.status);
  });
  it('updatePatient sin campos devuelve el paciente', () => {
    const w = world();
    expect(updatePatient(w.patA, {})?.id).toBe(w.patA);
  });
});

describe('API /api/auth', () => {
  it('register: 201 + token; 400 campos faltantes; 400 rol invalido; 409 duplicado', async () => {
    const body = { email: 'n@t.com', password: 'Abc12345!', name: 'N', role: 'patient' };
    const ok = await request(app, 'POST', '/api/auth/register', { body });
    expect(ok.status).toBe(201);
    expect(ok.body.token).toBeTruthy();
    expect(ok.body.user.password_hash).toBeUndefined();
    expect((await request(app, 'POST', '/api/auth/register', { body })).status).toBe(409);
    expect((await request(app, 'POST', '/api/auth/register', { body: { ...body, name: '' } })).status).toBe(400);
    expect((await request(app, 'POST', '/api/auth/register', { body: { ...body, email: 'z@t.com', role: 'superuser' } })).status).toBe(403);
  });

  it('login: 200, 401 password incorrecta, 401 usuario inexistente (mismo mensaje), 400 vacio', async () => {
    createTestUser({ email: 'l@t.com', password: 'Correcta1!', role: 'patient', name: 'L' });
    const ok = await request(app, 'POST', '/api/auth/login', { body: { email: 'l@t.com', password: 'Correcta1!' } });
    expect(ok.status).toBe(200);
    const bad = await request(app, 'POST', '/api/auth/login', { body: { email: 'l@t.com', password: 'mala' } });
    const none = await request(app, 'POST', '/api/auth/login', { body: { email: 'no@t.com', password: 'x' } });
    expect(bad.status).toBe(401);
    expect(none.status).toBe(401);
    expect(bad.body).toEqual(none.body);
    expect((await request(app, 'POST', '/api/auth/login', { body: { email: '', password: '' } })).status).toBe(400);
  });

  it('el token de login permite acceder a rutas protegidas', async () => {
    createTestUser({ email: 'l@t.com', password: 'Correcta1!', role: 'admin', name: 'L' });
    const { body } = await request(app, 'POST', '/api/auth/login', { body: { email: 'l@t.com', password: 'Correcta1!' } });
    expect((await request(app, 'GET', '/api/patients', { token: body.token })).status).toBe(200);
  });

  it('register con tipos erroneos (password numerico) no devuelve 201 con datos corruptos', async () => {
    const r = await request(app, 'POST', '/api/auth/register', {
      body: { email: 'n@t.com', password: 12345678, name: 'N', role: 'patient' },
    });
    expect(r.status).not.toBe(201);
  });

  it('register: no permite auto-registro con rol admin', async () => {
    const r = await request(app, 'POST', '/api/auth/register', {
      body: { email: 'evil@t.com', password: 'Abc12345!', name: 'Evil', role: 'admin' },
    });
    expect(r.status).toBe(403);
  });

  it('register: no permite auto-registro con rol doctor', async () => {
    const r = await request(app, 'POST', '/api/auth/register', {
      body: { email: 'doc@t.com', password: 'Abc12345!', name: 'Doc', role: 'doctor' },
    });
    expect(r.status).toBe(403);
  });

  it('register: sin rol crea un paciente', async () => {
    const r = await request(app, 'POST', '/api/auth/register', {
      body: { email: 'pac@t.com', password: 'Abc12345!', name: 'Pac' },
    });
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe('patient');
  });
});
