import { getDb } from '../database/connection';
import type { TokenPayload } from '../auth/auth.types';
import type { Alert, AlertFilters, CreateAlertDTO } from './alerts.types';

export function createAlert(dto: CreateAlertDTO): Alert {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO alerts (patient_id, metric_id, metric_type, value, severity)
    VALUES (?, ?, ?, ?, ?)
  `).run(dto.patient_id, dto.metric_id, dto.metric_type, dto.value, dto.severity);

  return db.prepare('SELECT * FROM alerts WHERE id = ?').get(result.lastInsertRowid) as Alert;
}

// Comprueba si el usuario puede acceder al paciente (patients.id).
export function canAccessPatient(patientId: number, user: TokenPayload): boolean {
  if (user.role === 'admin') return true;

  const patient = db_getPatient(patientId);
  if (!patient) return false;
  if (user.role === 'doctor') return patient.assigned_doctor_id === user.userId;
  if (user.role === 'patient') return patient.user_id === user.userId;
  return false;
}

function db_getPatient(patientId: number): { user_id: number; assigned_doctor_id: number | null } | undefined {
  return getDb()
    .prepare('SELECT user_id, assigned_doctor_id FROM patients WHERE id = ?')
    .get(patientId) as { user_id: number; assigned_doctor_id: number | null } | undefined;
}

/** Devuelve null si el paciente no existe o el usuario no tiene acceso (el caller responde 404). */
export function getAlertsByPatient(patientId: number, user: TokenPayload, filters: AlertFilters): Alert[] | null {
  if (!canAccessPatient(patientId, user)) return null;

  let query = 'SELECT * FROM alerts WHERE patient_id = ?';
  const params: unknown[] = [patientId];

  if (filters.severity) {
    query += ' AND severity = ?';
    params.push(filters.severity);
  }
  if (filters.acknowledged !== undefined) {
    query += ' AND acknowledged = ?';
    params.push(filters.acknowledged ? 1 : 0);
  }
  query += ' ORDER BY created_at DESC, id DESC';

  return getDb().prepare(query).all(...params) as Alert[];
}

/** Idempotente. Devuelve la alerta o null si no existe / sin acceso. */
export function acknowledgeAlert(alertId: number, user: TokenPayload): Alert | null {
  const db = getDb();
  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId) as Alert | undefined;
  if (!alert) return null;
  if (!canAccessPatient(alert.patient_id, user)) return null;

  if (alert.acknowledged === 0) {
    db.prepare(`
      UPDATE alerts
      SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = datetime('now')
      WHERE id = ? AND acknowledged = 0
    `).run(user.userId, alertId);
  }

  return db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId) as Alert;
}
