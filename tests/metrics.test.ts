import { describe, it, expect } from 'vitest';
import { checkMetricStatus, createMetric, getPatientSummary, getMetricsByPatient } from '../src/health-metrics/metrics.service';
import { validateCreateMetric } from '../src/health-metrics/metrics.validation';
import { getNotificationsForUser } from '../src/notifications/notifications.service';
import { createTestUser, createTestPatient } from './setup';
import type { MetricType } from '../src/health-metrics/metrics.types';

type S = 'normal' | 'warning' | 'critical';

// [valor, estado esperado] segun la tabla del CLAUDE.md
const cases: Record<string, [MetricType, [number, S][]]> = {
  'presion sistolica': ['blood_pressure', [
    [79, 'critical'], [80, 'warning'], [89, 'warning'], [90, 'normal'], [120, 'normal'],
    [121, 'warning'], [140, 'warning'], [141, 'critical'], [0, 'critical'], [300, 'critical'],
  ]],
  'glucosa': ['glucose', [
    [53, 'critical'], [54, 'warning'], [69, 'warning'], [70, 'normal'], [100, 'normal'],
    [101, 'warning'], [125, 'warning'], [126, 'critical'], [0, 'critical'],
  ]],
  'ritmo cardiaco': ['heart_rate', [
    [49, 'critical'], [50, 'warning'], [59, 'warning'], [60, 'normal'], [100, 'normal'],
    [101, 'warning'], [120, 'warning'], [121, 'critical'],
  ]],
  'temperatura': ['temperature', [
    [35.4, 'critical'], [35.5, 'warning'], [36.0, 'warning'], [36.1, 'normal'], [37.2, 'normal'],
    [37.3, 'warning'], [38.0, 'warning'], [38.1, 'critical'],
  ]],
  'saturacion O2': ['oxygen_saturation', [
    [89, 'critical'], [89.9, 'critical'], [90, 'warning'], [94, 'warning'], [95, 'normal'], [100, 'normal'],
  ]],
};

describe('checkMetricStatus (rangos del CLAUDE.md)', () => {
  for (const [label, [type, rows]] of Object.entries(cases)) {
    describe(label, () => {
      it.each(rows)(`${type}: %s -> %s`, (value, expected) => {
        expect(checkMetricStatus(type, value)).toBe(expected);
      });
    });
  }

  it('el peso nunca genera alertas', () => {
    for (const v of [0, 1, 70, 500, 99999]) expect(checkMetricStatus('weight', v)).toBe('normal');
  });

  // Hueco entre rangos: 36.05 no es "normal" ni <36.0; la tabla no lo define, se documenta el comportamiento actual.
  it('temperatura 36.05 (hueco entre <36.0 y 36.1) cae en warning', () => {
    expect(checkMetricStatus('temperature', 36.05)).toBe('warning');
  });

  // BUG: saturacion >100 es imposible pero devuelve 'warning' (metrics.service.ts:37-40)
  it.fails('saturacion O2 > 100 no deberia clasificarse como warning', () => {
    expect(checkMetricStatus('oxygen_saturation', 101)).not.toBe('warning');
  });
});

describe('validateCreateMetric', () => {
  const valid = {
    patient_id: 1, metric_type: 'glucose', value: 90, unit: 'mg/dL', recorded_at: '2024-01-01T10:00:00Z',
  };

  it('acepta un body valido', () => expect(validateCreateMetric(valid)).toBeNull());

  it.each(['patient_id', 'metric_type', 'value', 'unit', 'recorded_at'])('exige %s', field => {
    const body: Record<string, unknown> = { ...valid };
    delete body[field];
    expect(validateCreateMetric(body)).toMatch(/required/);
  });

  it('rechaza metric_type desconocido', () => {
    expect(validateCreateMetric({ ...valid, metric_type: 'colesterol' })).toMatch(/metric_type must be one of/);
  });
  it('rechaza value no numerico', () => {
    expect(validateCreateMetric({ ...valid, value: 'abc' })).toBe('value must be a number');
  });
  it('rechaza value negativo', () => {
    expect(validateCreateMetric({ ...valid, value: -1 })).toBe('value must be positive');
  });
  it('rechaza recorded_at no ISO', () => {
    expect(validateCreateMetric({ ...valid, recorded_at: '01/01/2024' })).toMatch(/ISO 8601/);
    expect(validateCreateMetric({ ...valid, recorded_at: 12345 })).toMatch(/ISO 8601/);
  });
  it('acepta value como string numerico (coercion)', () => {
    expect(validateCreateMetric({ ...valid, value: '90' })).toBeNull();
  });

  // BUG: DEBT en metrics.validation.ts:24 - presion sin diastolica se acepta
  it.fails('deberia exigir secondary_value para blood_pressure', () => {
    expect(validateCreateMetric({ ...valid, metric_type: 'blood_pressure', unit: 'mmHg', value: 120 })).not.toBeNull();
  });
  // BUG: no se valida que la unidad corresponda al tipo (VALID_UNITS solo se usa para las claves)
  it.fails('deberia rechazar unidad incorrecta para el tipo (glucosa en bpm)', () => {
    expect(validateCreateMetric({ ...valid, unit: 'bpm' })).not.toBeNull();
  });
  // BUG: value "" se coerciona a 0 y pasa la validacion (metrics.validation.ts:15-16)
  it.fails('deberia rechazar value cadena vacia', () => {
    expect(validateCreateMetric({ ...valid, value: '' })).not.toBeNull();
  });
  // BUG: fechas imposibles pasan el regex
  it.fails('deberia rechazar recorded_at con fecha imposible', () => {
    expect(validateCreateMetric({ ...valid, recorded_at: '2024-13-45T99:99:00Z' })).not.toBeNull();
  });
});

function setup() {
  const doctor = createTestUser({ email: 'd@t.com', password: 'p', role: 'doctor', name: 'Doc' });
  const patUser = createTestUser({ email: 'p@t.com', password: 'p', role: 'patient', name: 'Pat' });
  const patientId = createTestPatient({ userId: patUser, doctorId: doctor });
  return { doctor, patUser, patientId };
}

const asDoctor = (id: number) => ({ userId: id, email: '', role: 'doctor' as const, name: '' });

const mk = (patientId: number, type: MetricType, value: number, at: string, secondary?: number) => ({
  patient_id: patientId, metric_type: type, value, secondary_value: secondary,
  unit: 'x', recorded_at: at,
});

describe('createMetric y notificaciones', () => {
  it('no crea notificacion para valor normal', () => {
    const { doctor, patientId } = setup();
    createMetric(mk(patientId, 'glucose', 90, '2024-01-01T10:00'), doctor);
    expect(getNotificationsForUser(asDoctor(doctor))).toHaveLength(0);
  });

  it('crea notificacion warning enlazada a la metrica', () => {
    const { doctor, patientId } = setup();
    const m = createMetric(mk(patientId, 'glucose', 110, '2024-01-01T10:00'), doctor);
    const [n] = getNotificationsForUser(asDoctor(doctor));
    expect(n.type).toBe('metric_warning');
    expect(n.severity).toBe('warning');
    expect(n.related_metric_id).toBe(m.id);
  });

  it('crea notificacion critical', () => {
    const { doctor, patientId } = setup();
    createMetric(mk(patientId, 'heart_rate', 130, '2024-01-01T10:00'), doctor);
    const [n] = getNotificationsForUser(asDoctor(doctor));
    expect(n.type).toBe('metric_critical');
    expect(n.severity).toBe('critical');
    expect(n.title).toBe('heart rate crítico');
  });

  it('peso no genera notificacion', () => {
    const { doctor, patientId } = setup();
    createMetric(mk(patientId, 'weight', 400, '2024-01-01T10:00'), doctor);
    expect(getNotificationsForUser(asDoctor(doctor))).toHaveLength(0);
  });

  it('guarda recorded_by y secondary_value', () => {
    const { doctor, patientId } = setup();
    const m = createMetric(mk(patientId, 'blood_pressure', 118, '2024-01-01T10:00', 78), doctor);
    expect(m.recorded_by).toBe(doctor);
    expect(m.secondary_value).toBe(78);
    expect(m.recorded_by_name).toBe('Doc');
  });

  it('paciente inexistente lanza error (FK)', () => {
    const { doctor } = setup();
    expect(() => createMetric(mk(9999, 'glucose', 90, '2024-01-01T10:00'), doctor)).toThrow();
  });

  // BUG: la diastolica (secondary_value) nunca se evalua (metrics.service.ts, createMetric usa solo dto.value)
  it.fails('deberia alertar por diastolica critica (115/95)', () => {
    const { doctor, patientId } = setup();
    createMetric(mk(patientId, 'blood_pressure', 115, '2024-01-01T10:00', 95), doctor);
    expect(getNotificationsForUser(asDoctor(doctor))).toHaveLength(1);
  });

  // DEBT documentada: el mensaje no incluye el valor
  it.fails('el mensaje de notificacion deberia incluir el valor que disparo la alerta', () => {
    const { doctor, patientId } = setup();
    createMetric(mk(patientId, 'glucose', 145, '2024-01-01T10:00'), doctor);
    const [n] = getNotificationsForUser(asDoctor(doctor));
    expect(n.message).toContain('145');
  });
});

describe('getMetricsByPatient / getPatientSummary', () => {
  it('filtra por tipo y rango de fechas, orden descendente', () => {
    const { doctor, patientId } = setup();
    createMetric(mk(patientId, 'glucose', 90, '2024-01-01T10:00'), doctor);
    createMetric(mk(patientId, 'glucose', 95, '2024-01-03T10:00'), doctor);
    createMetric(mk(patientId, 'weight', 70, '2024-01-02T10:00'), doctor);

    expect(getMetricsByPatient(patientId, {})).toHaveLength(3);
    expect(getMetricsByPatient(patientId, { type: 'glucose' }).map(m => m.value)).toEqual([95, 90]);
    expect(getMetricsByPatient(patientId, { dateFrom: '2024-01-02T00:00', dateTo: '2024-01-02T23:59' })).toHaveLength(1);
  });

  it('tipo con SQL injection no rompe ni devuelve filas', () => {
    const { doctor, patientId } = setup();
    createMetric(mk(patientId, 'glucose', 90, '2024-01-01T10:00'), doctor);
    expect(getMetricsByPatient(patientId, { type: "glucose' OR '1'='1" })).toHaveLength(0);
  });

  it('resumen vacio sin metricas', () => {
    const { patientId } = setup();
    expect(getPatientSummary(patientId)).toEqual([]);
  });

  it('calcula avg/min/max/count/status con el ultimo valor', () => {
    const { doctor, patientId } = setup();
    createMetric(mk(patientId, 'glucose', 80, '2024-01-01T10:00'), doctor);
    createMetric(mk(patientId, 'glucose', 130, '2024-01-02T10:00'), doctor);
    const [s] = getPatientSummary(patientId);
    expect(s).toMatchObject({
      metric_type: 'glucose', latest_value: 130, avg_value: 105, min_value: 80, max_value: 130,
      count: 2, status: 'critical', trend: 'stable',
    });
  });

  it('tendencia rising / falling / stable con 6 lecturas', () => {
    const { doctor, patientId } = setup();
    const feed = (type: MetricType, vals: number[]) =>
      vals.forEach((v, i) => createMetric(mk(patientId, type, v, `2024-01-0${i + 1}T10:00`), doctor));
    feed('weight', [70, 70, 70, 80, 80, 80]);        // las 3 mas recientes (80) > anteriores (70)
    feed('heart_rate', [80, 80, 80, 70, 70, 70]);    // las 3 mas recientes (70) < anteriores (80)
    feed('temperature', [36.5, 36.5, 36.5, 36.5, 36.5, 36.5]);
    const byType = Object.fromEntries(getPatientSummary(patientId).map(s => [s.metric_type, s.trend]));
    expect(byType.weight).toBe('rising');
    expect(byType.heart_rate).toBe('falling');
    expect(byType.temperature).toBe('stable');
  });

  it('con menos de 6 lecturas la tendencia es stable', () => {
    const { doctor, patientId } = setup();
    [70, 70, 90, 90, 90].forEach((v, i) =>
      createMetric(mk(patientId, 'weight', v, `2024-01-0${i + 1}T10:00`), doctor));
    expect(getPatientSummary(patientId)[0].trend).toBe('stable');
  });
});
