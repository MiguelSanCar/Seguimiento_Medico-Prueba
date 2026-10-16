import { describe, it, expect } from 'vitest';
import { buildApp, request, tokenFor } from './http-helper';
import { createTestUser, createTestPatient } from './setup';
import { getDb } from '../src/database/connection';
import { createMetric } from '../src/health-metrics/metrics.service';
import { createAlert, getAlertsByPatient, acknowledgeAlert } from '../src/alerts/alerts.service';
import type { TokenPayload } from '../src/auth/auth.types';

const app = buildApp();

let seq = 0; // emails unicos: world() puede llamarse varias veces dentro de un mismo test
function world() {
  const n = ++seq;
  const admin = createTestUser({ email: `a${n}@t.com`, password: 'p', role: 'admin', name: 'Admin' });
  const docA = createTestUser({ email: `da${n}@t.com`, password: 'p', role: 'doctor', name: 'Doc A' });
  const docB = createTestUser({ email: `db${n}@t.com`, password: 'p', role: 'doctor', name: 'Doc B' });
  const uA = createTestUser({ email: `pa${n}@t.com`, password: 'p', role: 'patient', name: 'Pat A' });
  const uB = createTestUser({ email: `pb${n}@t.com`, password: 'p', role: 'patient', name: 'Pat B' });
  const patA = createTestPatient({ userId: uA, doctorId: docA });
  const patB = createTestPatient({ userId: uB, doctorId: docB });
  const tok = (id: number, role: TokenPayload['role']) => tokenFor({ userId: id, email: 'x@t.com', role, name: 'x' });
  return {
    admin, docA, docB, uA, uB, patA, patB,
    tAdmin: tok(admin, 'admin'), tDocA: tok(docA, 'doctor'), tDocB: tok(docB, 'doctor'),
    tPatA: tok(uA, 'patient'), tPatB: tok(uB, 'patient'),
  };
}

type W = ReturnType<typeof world>;

const UNITS: Record<string, string> = {
  blood_pressure: 'mmHg', glucose: 'mg/dL', weight: 'kg', heart_rate: 'bpm', temperature: '°C', oxygen_saturation: '%',
};

function add(w: W, metric_type: string, value: number, secondary_value?: number) {
  return createMetric({
    patient_id: w.patA, metric_type, value, secondary_value, unit: UNITS[metric_type], recorded_at: '2024-01-01T10:00:00Z',
  } as any, w.docA);
}

const alertsOf = (patientId: number) => getDb().prepare('SELECT * FROM alerts WHERE patient_id = ? ORDER BY id').all(patientId) as any[];

/** Severidad de la alerta generada ('none' si no se crea ninguna). */
function severityFor(metric_type: string, value: number, secondary?: number): string {
  const w = world();
  add(w, metric_type, value, secondary);
  const a = alertsOf(w.patA);
  expect(a.length).toBeLessThanOrEqual(1);
  return a.length ? a[0].severity : 'none';
}

describe('Creacion de alertas en createMetric', () => {
  it.each([
    ['glucose', 130, 'critical'], ['glucose', 110, 'warning'],
    ['blood_pressure', 150, 'critical'], ['blood_pressure', 130, 'warning'],
    ['heart_rate', 130, 'critical'], ['heart_rate', 110, 'warning'],
    ['temperature', 39, 'critical'], ['temperature', 37.5, 'warning'],
    ['oxygen_saturation', 85, 'critical'], ['oxygen_saturation', 92, 'warning'],
  ])('%s=%s genera alerta %s con valor y tipo correctos', (type, value, severity) => {
    const w = world();
    const m = add(w, type, value);
    const a = alertsOf(w.patA);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      patient_id: w.patA, metric_id: m.id, metric_type: type, value, severity,
      acknowledged: 0, acknowledged_by: null, acknowledged_at: null,
    });
    expect(a[0].created_at).toBeTruthy();
  });

  it('no crea alerta con metricas normales', () => {
    const w = world();
    add(w, 'glucose', 85);
    add(w, 'blood_pressure', 110, 70);
    add(w, 'heart_rate', 70);
    add(w, 'temperature', 36.6);
    add(w, 'oxygen_saturation', 98);
    expect(alertsOf(w.patA)).toHaveLength(0);
  });

  it('el peso nunca genera alerta, ni con valores extremos', () => {
    const w = world();
    add(w, 'weight', 70);
    add(w, 'weight', 0);
    add(w, 'weight', 500);
    expect(alertsOf(w.patA)).toHaveLength(0);
  });

  it('una alerta por metrica anomala y la alerta apunta a su metrica', () => {
    const w = world();
    const m1 = add(w, 'glucose', 130);
    add(w, 'glucose', 90);
    const m3 = add(w, 'glucose', 110);
    const a = alertsOf(w.patA);
    expect(a.map(x => x.metric_id)).toEqual([m1.id, m3.id]);
  });

  it('las alertas se asocian al paciente correcto', () => {
    const w = world();
    add(w, 'glucose', 130);
    expect(alertsOf(w.patB)).toHaveLength(0);
  });

  describe('presion arterial: peor severidad entre sistolica y diastolica', () => {
    it('diastolica critica con sistolica normal -> critical con valor diastolico', () => {
      const w = world();
      add(w, 'blood_pressure', 110, 95);
      const a = alertsOf(w.patA);
      expect(a).toHaveLength(1);
      expect(a[0]).toMatchObject({ severity: 'critical', value: 95, metric_type: 'blood_pressure' });
    });
    it('diastolica warning con sistolica normal -> warning con valor diastolico', () => {
      const w = world();
      add(w, 'blood_pressure', 110, 85);
      expect(alertsOf(w.patA)[0]).toMatchObject({ severity: 'warning', value: 85 });
    });
    it('sistolica critica con diastolica warning -> critical con valor sistolico', () => {
      const w = world();
      add(w, 'blood_pressure', 150, 85);
      expect(alertsOf(w.patA)[0]).toMatchObject({ severity: 'critical', value: 150 });
    });
    it('sistolica warning con diastolica critica -> critical con valor diastolico', () => {
      const w = world();
      add(w, 'blood_pressure', 130, 95);
      expect(alertsOf(w.patA)[0]).toMatchObject({ severity: 'critical', value: 95 });
    });
    it('misma severidad en ambas -> se conserva el valor sistolico', () => {
      const w = world();
      add(w, 'blood_pressure', 130, 85);
      expect(alertsOf(w.patA)[0]).toMatchObject({ severity: 'warning', value: 130 });
    });
    it('sin diastolica solo se evalua la sistolica', () => {
      const w = world();
      add(w, 'blood_pressure', 110);
      expect(alertsOf(w.patA)).toHaveLength(0);
    });
    it('diastolica 0 (falsy) si se evalua: critical', () => {
      const w = world();
      add(w, 'blood_pressure', 110, 0);
      expect(alertsOf(w.patA)[0]).toMatchObject({ severity: 'critical', value: 0 });
    });
    it('secondary_value no numerico se ignora (no rompe ni alerta)', () => {
      const w = world();
      expect(() => add(w, 'blood_pressure', 110, 'abc' as any)).not.toThrow();
    });
    it('secondary_value en otros tipos se ignora', () => {
      expect(severityFor('glucose', 90, 200)).toBe('none');
    });
  });

  describe('valores limite exactos', () => {
    const cases: Array<[string, number, string, number?]> = [
      // glucosa
      ['glucose', 53.9, 'critical'], ['glucose', 54, 'warning'], ['glucose', 69, 'warning'],
      ['glucose', 69.9, 'warning'], ['glucose', 70, 'none'], ['glucose', 100, 'none'],
      ['glucose', 101, 'warning'], ['glucose', 125, 'warning'], ['glucose', 125.1, 'critical'], ['glucose', 126, 'critical'],
      // sistolica
      ['blood_pressure', 79, 'critical'], ['blood_pressure', 79.9, 'critical'], ['blood_pressure', 80, 'warning'],
      ['blood_pressure', 89, 'warning'], ['blood_pressure', 90, 'none'], ['blood_pressure', 120, 'none'],
      ['blood_pressure', 121, 'warning'], ['blood_pressure', 140, 'warning'], ['blood_pressure', 141, 'critical'],
      // diastolica (sistolica normal = 100)
      ['blood_pressure', 100, 'critical', 49], ['blood_pressure', 100, 'critical', 49.9],
      ['blood_pressure', 100, 'warning', 50], ['blood_pressure', 100, 'warning', 59],
      ['blood_pressure', 100, 'none', 60], ['blood_pressure', 100, 'none', 80],
      ['blood_pressure', 100, 'warning', 81], ['blood_pressure', 100, 'warning', 90],
      ['blood_pressure', 100, 'critical', 91],
      // ritmo cardiaco
      ['heart_rate', 49, 'critical'], ['heart_rate', 50, 'warning'], ['heart_rate', 59, 'warning'],
      ['heart_rate', 60, 'none'], ['heart_rate', 100, 'none'], ['heart_rate', 101, 'warning'],
      ['heart_rate', 120, 'warning'], ['heart_rate', 121, 'critical'],
      // temperatura
      ['temperature', 35.4, 'critical'], ['temperature', 35.5, 'warning'], ['temperature', 36.0, 'warning'],
      ['temperature', 36.1, 'none'], ['temperature', 37.2, 'none'], ['temperature', 37.3, 'warning'],
      ['temperature', 38.0, 'warning'], ['temperature', 38.1, 'critical'],
      // SpO2
      ['oxygen_saturation', 89, 'critical'], ['oxygen_saturation', 89.9, 'critical'], ['oxygen_saturation', 90, 'warning'],
      ['oxygen_saturation', 94, 'warning'], ['oxygen_saturation', 95, 'none'], ['oxygen_saturation', 100, 'none'],
    ];
    it.each(cases)('%s valor=%s sec=%s -> %s', (type, value, expected, secondary) => {
      // el orden de los parametros de it.each es (type, value, expected, secondary)
      expect(severityFor(type, value, secondary)).toBe(expected);
    });

    it('valores extremos: 0 es critical y 1000 es critical', () => {
      expect(severityFor('glucose', 0)).toBe('critical');
      expect(severityFor('glucose', 1000)).toBe('critical');
      expect(severityFor('oxygen_saturation', 0)).toBe('critical');
    });

    // BUG (posible): SpO2 > 100 es fisicamente imposible pero se trata como 'warning'
    // (metrics.service.ts:19-41: fuera de normalMax=100 y no <90 -> warning). Ni la validacion lo rechaza.
    it.fails('SpO2 > 100% no deberia generar una alerta warning (valor imposible, deberia rechazarse)', () => {
      expect(severityFor('oxygen_saturation', 101)).toBe('none');
    });
  });

  describe('atomicidad: metrica + alerta + notificacion en la misma transaccion', () => {
    const count = (t: string) => (getDb().prepare(`SELECT COUNT(*) c FROM ${t}`).get() as any).c;

    it('crea metrica, alerta y notificacion juntas', () => {
      const w = world();
      const m = add(w, 'glucose', 130);
      expect(count('health_metrics')).toBe(1);
      expect(count('alerts')).toBe(1);
      expect(count('notifications')).toBe(1);
      const n = getDb().prepare('SELECT * FROM notifications').get() as any;
      expect(n.related_metric_id).toBe(m.id);
      expect(alertsOf(w.patA)[0].severity).toBe(n.severity);
    });

    it('metrica normal: solo se crea la metrica', () => {
      const w = world();
      add(w, 'glucose', 90);
      expect([count('health_metrics'), count('alerts'), count('notifications')]).toEqual([1, 0, 0]);
    });

    function withFailingTrigger(table: string, fn: () => void) {
      const db = getDb();
      db.exec(`CREATE TRIGGER t_fail BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
      try { fn(); } finally { db.exec('DROP TRIGGER IF EXISTS t_fail'); }
    }

    it('si falla la notificacion se revierte tambien la metrica y la alerta', () => {
      const w = world();
      withFailingTrigger('notifications', () => {
        expect(() => add(w, 'glucose', 130)).toThrow(/forced failure/);
      });
      expect([count('health_metrics'), count('alerts'), count('notifications')]).toEqual([0, 0, 0]);
    });

    it('si falla la alerta se revierte la metrica y no hay notificacion', () => {
      const w = world();
      withFailingTrigger('alerts', () => {
        expect(() => add(w, 'glucose', 130)).toThrow(/forced failure/);
      });
      expect([count('health_metrics'), count('alerts'), count('notifications')]).toEqual([0, 0, 0]);
    });

    it('paciente inexistente (FK): falla y no deja alerta huerfana', () => {
      const w = world();
      expect(() => createMetric({
        patient_id: 9999, metric_type: 'glucose', value: 130, unit: 'mg/dL', recorded_at: '2024-01-01T10:00:00Z',
      } as any, w.docA)).toThrow();
      expect([count('health_metrics'), count('alerts'), count('notifications')]).toEqual([0, 0, 0]);
    });
  });

  describe('restricciones de la tabla alerts', () => {
    it('rechaza severity invalida y metric_id inexistente (FK)', () => {
      const w = world();
      const m = add(w, 'glucose', 90);
      expect(() => createAlert({ patient_id: w.patA, metric_id: m.id, metric_type: 'glucose', value: 1, severity: 'info' as any })).toThrow();
      expect(() => createAlert({ patient_id: w.patA, metric_id: 9999, metric_type: 'glucose', value: 1, severity: 'warning' })).toThrow();
      expect(() => createAlert({ patient_id: 9999, metric_id: m.id, metric_type: 'glucose', value: 1, severity: 'warning' })).toThrow();
    });

    it('createAlert devuelve la fila insertada con acknowledged=0', () => {
      const w = world();
      const m = add(w, 'glucose', 90);
      const a = createAlert({ patient_id: w.patA, metric_id: m.id, metric_type: 'glucose', value: 150, severity: 'critical' });
      expect(a).toMatchObject({ patient_id: w.patA, metric_id: m.id, value: 150, severity: 'critical', acknowledged: 0 });
    });
  });
});

describe('GET /api/alerts/:patientId', () => {
  it('401 sin token y con token invalido', async () => {
    expect((await request(app, 'GET', '/api/alerts/1')).status).toBe(401);
    expect((await request(app, 'GET', '/api/alerts/1', { token: 'basura' })).status).toBe(401);
  });

  it('admin ve alertas de cualquier paciente: { data, count }', async () => {
    const w = world();
    add(w, 'glucose', 130);
    const r = await request(app, 'GET', `/api/alerts/${w.patA}`, { token: w.tAdmin });
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(1);
    expect(r.body.data[0]).toMatchObject({ patient_id: w.patA, metric_type: 'glucose', value: 130, severity: 'critical', acknowledged: 0 });
  });

  it('paciente sin alertas -> 200 con lista vacia', async () => {
    const w = world();
    const r = await request(app, 'GET', `/api/alerts/${w.patA}`, { token: w.tDocA });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ data: [], count: 0 });
  });

  it('doctor asignado 200; doctor ajeno 404 (sin filtrar existencia)', async () => {
    const w = world();
    add(w, 'glucose', 130);
    expect((await request(app, 'GET', `/api/alerts/${w.patA}`, { token: w.tDocA })).status).toBe(200);
    const r = await request(app, 'GET', `/api/alerts/${w.patA}`, { token: w.tDocB });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Patient not found' });
  });

  it('paciente ve lo suyo (200) y lo ajeno da 404', async () => {
    const w = world();
    add(w, 'glucose', 130);
    expect((await request(app, 'GET', `/api/alerts/${w.patA}`, { token: w.tPatA })).body.count).toBe(1);
    const r = await request(app, 'GET', `/api/alerts/${w.patA}`, { token: w.tPatB });
    expect(r.status).toBe(404);
    expect(r.body.data).toBeUndefined();
  });

  it('paciente inexistente: 404 para admin, doctor y paciente (misma respuesta que ajeno)', async () => {
    const w = world();
    for (const t of [w.tAdmin, w.tDocA, w.tPatA]) {
      const r = await request(app, 'GET', '/api/alerts/9999', { token: t });
      // admin: canAccessPatient devuelve true sin comprobar existencia -> 200 vacio (ver test siguiente)
      if (t === w.tAdmin) expect(r.status).toBe(200); else expect(r.status).toBe(404);
    }
  });

  // Inconsistencia: admin recibe 200 con lista vacia para un paciente que no existe, los demas roles 404.
  // alerts.service.ts:17 (`if (user.role === 'admin') return true` antes de comprobar que el paciente existe).
  it.fails('admin con patientId inexistente deberia recibir 404 como el resto de roles', async () => {
    const w = world();
    const r = await request(app, 'GET', '/api/alerts/9999', { token: w.tAdmin });
    expect(r.status).toBe(404);
  });

  it('token de usuario con rol patient sin registro de paciente -> 404', async () => {
    const w = world();
    const orphan = createTestUser({ email: 'o@t.com', password: 'p', role: 'patient', name: 'O' });
    const t = tokenFor({ userId: orphan, email: 'o@t.com', role: 'patient', name: 'O' });
    expect((await request(app, 'GET', `/api/alerts/${w.patA}`, { token: t })).status).toBe(404);
  });

  it('paciente sin doctor asignado: un doctor no tiene acceso', async () => {
    const w = world();
    const u = createTestUser({ email: 'free@t.com', password: 'p', role: 'patient', name: 'Free' });
    const pid = createTestPatient({ userId: u });
    expect((await request(app, 'GET', `/api/alerts/${pid}`, { token: w.tDocA })).status).toBe(404);
  });

  it.each(['abc', '1.5', '-1', '1e3', '0x10', '1abc', ' 1'])('patientId %j no entero -> 400', async (id) => {
    const w = world();
    const r = await request(app, 'GET', `/api/alerts/${encodeURIComponent(id)}`, { token: w.tAdmin });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Invalid patientId' });
  });

  describe('filtros y orden', () => {
    function seed() {
      const w = world();
      add(w, 'glucose', 130);       // critical
      add(w, 'glucose', 110);       // warning
      add(w, 'heart_rate', 130);    // critical
      add(w, 'heart_rate', 110);    // warning
      const ids = alertsOf(w.patA).map(a => a.id);
      // created_at fijos y distintos para un orden determinista
      getDb().prepare('UPDATE alerts SET created_at = ? WHERE id = ?').run('2024-01-01 10:00:00', ids[0]);
      getDb().prepare('UPDATE alerts SET created_at = ? WHERE id = ?').run('2024-01-03 10:00:00', ids[1]);
      getDb().prepare('UPDATE alerts SET created_at = ? WHERE id = ?').run('2024-01-02 10:00:00', ids[2]);
      getDb().prepare('UPDATE alerts SET created_at = ? WHERE id = ?').run('2024-01-03 10:00:00', ids[3]); // empata con ids[1]
      return { w, ids };
    }
    const get = (w: W, qs: string) => request(app, 'GET', `/api/alerts/${w.patA}${qs}`, { token: w.tDocA });

    it('orden created_at DESC y desempate por id DESC', async () => {
      const { w, ids } = seed();
      const r = await get(w, '');
      expect(r.body.count).toBe(4);
      expect(r.body.data.map((a: any) => a.id)).toEqual([ids[3], ids[1], ids[2], ids[0]]);
    });

    it('filtro severity=critical / warning', async () => {
      const { w } = seed();
      const c = await get(w, '?severity=critical');
      expect(c.body.count).toBe(2);
      expect(c.body.data.every((a: any) => a.severity === 'critical')).toBe(true);
      const wn = await get(w, '?severity=warning');
      expect(wn.body.count).toBe(2);
      expect(wn.body.data.every((a: any) => a.severity === 'warning')).toBe(true);
    });

    it('filtro acknowledged true/1 y false/0', async () => {
      const { w, ids } = seed();
      acknowledgeAlert(ids[0], { userId: w.docA, role: 'doctor', email: '', name: '' });
      for (const v of ['true', '1']) {
        const r = await get(w, `?acknowledged=${v}`);
        expect(r.body.data.map((a: any) => a.id)).toEqual([ids[0]]);
      }
      for (const v of ['false', '0']) {
        const r = await get(w, `?acknowledged=${v}`);
        expect(r.body.count).toBe(3);
        expect(r.body.data.every((a: any) => a.acknowledged === 0)).toBe(true);
      }
    });

    it('filtros combinados', async () => {
      const { w, ids } = seed();
      acknowledgeAlert(ids[0], { userId: w.docA, role: 'doctor', email: '', name: '' }); // critical glucosa
      const r = await get(w, '?severity=critical&acknowledged=false');
      expect(r.body.data.map((a: any) => a.id)).toEqual([ids[2]]);
      const none = await get(w, '?severity=warning&acknowledged=true');
      expect(none.body).toEqual({ data: [], count: 0 });
    });

    it.each(['severity=info', 'severity=CRITICAL', 'severity=', 'severity=a&severity=b', 'severity[]=critical'])
      ('valor invalido %s -> 400', async (qs) => {
        const w = world();
        const r = await request(app, 'GET', `/api/alerts/${w.patA}?${qs}`, { token: w.tAdmin });
        expect(r.status).toBe(400);
        expect(r.body.error).toMatch(/severity/);
      });

    it.each(['acknowledged=yes', 'acknowledged=', 'acknowledged=TRUE', 'acknowledged=2', 'acknowledged=true&acknowledged=false'])
      ('valor invalido %s -> 400', async (qs) => {
        const w = world();
        const r = await request(app, 'GET', `/api/alerts/${w.patA}?${qs}`, { token: w.tAdmin });
        expect(r.status).toBe(400);
        expect(r.body.error).toMatch(/acknowledged/);
      });

    it('la validacion de filtros (400) precede al control de acceso (404)', async () => {
      const w = world();
      const r = await request(app, 'GET', `/api/alerts/${w.patA}?severity=zzz`, { token: w.tDocB });
      expect(r.status).toBe(400);
    });

    it('un filtro no interfiere con alertas de otro paciente', async () => {
      const { w } = seed();
      const r = await request(app, 'GET', `/api/alerts/${w.patB}`, { token: w.tAdmin });
      expect(r.body.count).toBe(0);
    });
  });

  it('getAlertsByPatient (servicio): null si sin acceso, [] si no hay alertas', () => {
    const w = world();
    expect(getAlertsByPatient(w.patA, { userId: w.docB, role: 'doctor', email: '', name: '' }, {})).toBeNull();
    expect(getAlertsByPatient(w.patA, { userId: w.docA, role: 'doctor', email: '', name: '' }, {})).toEqual([]);
  });
});

describe('PATCH /api/alerts/:id/acknowledge', () => {
  function oneAlert() {
    const w = world();
    add(w, 'glucose', 130);
    const alert = alertsOf(w.patA)[0];
    return { w, id: alert.id as number };
  }
  const ack = (id: number | string, token?: string) => request(app, 'PATCH', `/api/alerts/${id}/acknowledge`, { token });

  it('401 sin token y no modifica la alerta', async () => {
    const { id } = oneAlert();
    expect((await ack(id)).status).toBe(401);
    expect(alertsOf(1)[0].acknowledged).toBe(0);
  });

  it('admin reconoce: 200, { data } con acknowledged, by y at', async () => {
    const { w, id } = oneAlert();
    const r = await ack(id, w.tAdmin);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ id, acknowledged: 1, acknowledged_by: w.admin });
    expect(r.body.data.acknowledged_at).toBeTruthy();
  });

  it('doctor asignado reconoce y queda registrado como acknowledged_by', async () => {
    const { w, id } = oneAlert();
    const r = await ack(id, w.tDocA);
    expect(r.status).toBe(200);
    expect(r.body.data.acknowledged_by).toBe(w.docA);
  });

  it('doctor ajeno -> 404 y la alerta no cambia', async () => {
    const { w, id } = oneAlert();
    const r = await ack(id, w.tDocB);
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Alert not found' });
    expect(alertsOf(w.patA)[0]).toMatchObject({ acknowledged: 0, acknowledged_by: null, acknowledged_at: null });
  });

  it('paciente propio 200; paciente ajeno 404 sin cambios', async () => {
    const { w, id } = oneAlert();
    expect((await ack(id, w.tPatB)).status).toBe(404);
    expect(alertsOf(w.patA)[0].acknowledged).toBe(0);
    const r = await ack(id, w.tPatA);
    expect(r.status).toBe(200);
    expect(r.body.data.acknowledged_by).toBe(w.uA);
  });

  it('404 para alerta inexistente (todos los roles)', async () => {
    const w = world();
    for (const t of [w.tAdmin, w.tDocA, w.tPatA]) {
      const r = await ack(9999, t);
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ error: 'Alert not found' });
    }
  });

  it.each(['abc', '1.5', '-1', '1e3', '0x1'])('id %j no entero -> 400', async (id) => {
    const w = world();
    const r = await ack(encodeURIComponent(id), w.tAdmin);
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'Invalid id' });
  });

  it('idempotente: segundo acknowledge devuelve 200 sin cambiar acknowledged_by/at', async () => {
    const { w, id } = oneAlert();
    const first = await ack(id, w.tDocA);
    expect(first.body.data.acknowledged_by).toBe(w.docA);
    // fijar un timestamp antiguo para detectar cualquier reescritura (sin depender del reloj)
    getDb().prepare("UPDATE alerts SET acknowledged_at = '2000-01-01 00:00:00' WHERE id = ?").run(id);

    const second = await ack(id, w.tAdmin);
    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ acknowledged: 1, acknowledged_by: w.docA, acknowledged_at: '2000-01-01 00:00:00' });
    const third = await ack(id, w.tPatA);
    expect(third.body.data).toMatchObject({ acknowledged_by: w.docA, acknowledged_at: '2000-01-01 00:00:00' });
  });

  it('solo afecta a la alerta indicada', async () => {
    const { w, id } = oneAlert();
    add(w, 'heart_rate', 130);
    await ack(id, w.tAdmin);
    const a = alertsOf(w.patA);
    expect(a.map(x => x.acknowledged)).toEqual([1, 0]);
  });

  it('PUT/GET sobre /:id/acknowledge no esta soportado', async () => {
    const { w, id } = oneAlert();
    const r = await request(app, 'GET', `/api/alerts/${id}/acknowledge`, { token: w.tAdmin });
    expect(r.status).toBe(404);
  });

  it('servicio acknowledgeAlert: null si inexistente o sin acceso', () => {
    const { w, id } = oneAlert();
    expect(acknowledgeAlert(9999, { userId: w.admin, role: 'admin', email: '', name: '' })).toBeNull();
    expect(acknowledgeAlert(id, { userId: w.docB, role: 'doctor', email: '', name: '' })).toBeNull();
  });
});

describe('Flujo end-to-end por API', () => {
  it('POST metrica critica -> aparece en GET alertas -> acknowledge -> filtro acknowledged', async () => {
    const w = world();
    const post = await request(app, 'POST', '/api/health-metrics', {
      token: w.tDocA,
      body: { patient_id: w.patA, metric_type: 'blood_pressure', value: 130, secondary_value: 95, unit: 'mmHg', recorded_at: '2024-01-01T10:00:00Z' },
    });
    expect(post.status).toBe(201);
    const list = await request(app, 'GET', `/api/alerts/${w.patA}?acknowledged=false`, { token: w.tPatA });
    expect(list.body.count).toBe(1);
    expect(list.body.data[0]).toMatchObject({ severity: 'critical', value: 95, metric_id: post.body.data.id });
    expect((await request(app, 'PATCH', `/api/alerts/${list.body.data[0].id}/acknowledge`, { token: w.tDocA })).status).toBe(200);
    expect((await request(app, 'GET', `/api/alerts/${w.patA}?acknowledged=false`, { token: w.tPatA })).body.count).toBe(0);
    expect((await request(app, 'GET', `/api/alerts/${w.patA}?acknowledged=true`, { token: w.tPatA })).body.count).toBe(1);
  });

  it('valor numerico enviado como string en el POST se guarda como numero en la alerta', async () => {
    const w = world();
    await request(app, 'POST', '/api/health-metrics', {
      token: w.tDocA,
      body: { patient_id: w.patA, metric_type: 'glucose', value: '130', unit: 'mg/dL', recorded_at: '2024-01-01T10:00:00Z' },
    });
    const a = alertsOf(w.patA);
    expect(a).toHaveLength(1);
    expect(typeof a[0].value).toBe('number');
    expect(a[0].value).toBe(130);
  });
});
