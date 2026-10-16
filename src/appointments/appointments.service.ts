import { getDb } from '../database/connection';
import type { Appointment, CreateAppointmentDTO, UpdateAppointmentDTO } from './appointments.types';
import type { TokenPayload } from '../auth/auth.types';

export function getAppointments(user: TokenPayload): Appointment[] {
  const db = getDb();

  if (user.role === 'admin') {
    return db.prepare(`
      SELECT a.*,
             up.name as patient_name,
             ud.name as doctor_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN users up ON p.user_id = up.id
      JOIN users ud ON a.doctor_id = ud.id
      ORDER BY a.date_time DESC
    `).all() as Appointment[];
  }

  if (user.role === 'doctor') {
    return db.prepare(`
      SELECT a.*,
             up.name as patient_name,
             ud.name as doctor_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN users up ON p.user_id = up.id
      JOIN users ud ON a.doctor_id = ud.id
      WHERE a.doctor_id = ?
      ORDER BY a.date_time DESC
    `).all(user.userId) as Appointment[];
  }

  // patient
  return db.prepare(`
    SELECT a.*,
           up.name as patient_name,
           ud.name as doctor_name
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN users up ON p.user_id = up.id
    JOIN users ud ON a.doctor_id = ud.id
    WHERE p.user_id = ?
    ORDER BY a.date_time DESC
  `).all(user.userId) as Appointment[];
}

export function getAppointmentById(id: number, user: TokenPayload): Appointment | null {
  const db = getDb();

  const appt = db.prepare(`
    SELECT a.*,
           up.name as patient_name,
           ud.name as doctor_name
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN users up ON p.user_id = up.id
    JOIN users ud ON a.doctor_id = ud.id
    WHERE a.id = ?
  `).get(id) as Appointment | undefined;

  if (!appt) return null;

  if (user.role === 'doctor' && appt.doctor_id !== user.userId) return null;
  if (user.role === 'patient') {
    const patient = db.prepare('SELECT user_id FROM patients WHERE id = ?').get(appt.patient_id) as { user_id: number } | undefined;
    if (!patient || patient.user_id !== user.userId) return null;
  }

  return appt;
}

export function createAppointment(dto: CreateAppointmentDTO): Appointment {
  const db = getDb();

  const result = db.prepare(`
    INSERT INTO appointments (patient_id, doctor_id, date_time, duration_minutes, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    dto.patient_id,
    dto.doctor_id,
    dto.date_time,
    dto.duration_minutes || 30,
    dto.reason || null
  );

  return getAppointmentById(result.lastInsertRowid as number, { role: 'admin' } as TokenPayload) as Appointment;
}

export function updateAppointment(id: number, dto: UpdateAppointmentDTO, user: TokenPayload): Appointment | null {
  const db = getDb();

  const existing = getAppointmentById(id, user);
  if (!existing) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (dto.date_time !== undefined) { fields.push('date_time = ?'); values.push(dto.date_time); }
  if (dto.duration_minutes !== undefined) { fields.push('duration_minutes = ?'); values.push(dto.duration_minutes); }
  if (dto.status !== undefined) { fields.push('status = ?'); values.push(dto.status); }
  if (dto.reason !== undefined) { fields.push('reason = ?'); values.push(dto.reason); }
  if (dto.notes !== undefined) { fields.push('notes = ?'); values.push(dto.notes); }

  if (fields.length === 0) return existing;

  values.push(id);
  db.prepare(`UPDATE appointments SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getAppointmentById(id, { role: 'admin' } as TokenPayload);
}

export function cancelAppointment(id: number, user: TokenPayload): boolean {
  const db = getDb();

  const existing = getAppointmentById(id, user);
  if (!existing) return false;

  db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").run(id);
  return true;
}
