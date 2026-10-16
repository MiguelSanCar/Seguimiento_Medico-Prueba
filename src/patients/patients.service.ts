import { getDb } from '../database/connection';
import type { Patient, CreatePatientDTO, UpdatePatientDTO } from './patients.types';
import type { TokenPayload } from '../auth/auth.types';

export function getPatients(user: TokenPayload): Patient[] {
  const db = getDb();

  if (user.role === 'admin') {
    return db.prepare(`
      SELECT p.*, u.name, u.email,
             d.name as doctor_name
      FROM patients p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN users d ON p.assigned_doctor_id = d.id
    `).all() as Patient[];
  }

  if (user.role === 'doctor') {
    return db.prepare(`
      SELECT p.*, u.name, u.email,
             d.name as doctor_name
      FROM patients p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN users d ON p.assigned_doctor_id = d.id
      WHERE p.assigned_doctor_id = ?
    `).all(user.userId) as Patient[];
  }

  // patient: solo su propio registro
  return db.prepare(`
    SELECT p.*, u.name, u.email,
           d.name as doctor_name
    FROM patients p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN users d ON p.assigned_doctor_id = d.id
    WHERE p.user_id = ?
  `).all(user.userId) as Patient[];
}

export function getPatientById(id: number, user: TokenPayload): Patient | null {
  const db = getDb();

  const patient = db.prepare(`
    SELECT p.*, u.name, u.email,
           d.name as doctor_name
    FROM patients p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN users d ON p.assigned_doctor_id = d.id
    WHERE p.id = ?
  `).get(id) as Patient | undefined;

  if (!patient) return null;

  // FIXME: Falla de seguridad — cualquier doctor puede ver cualquier paciente,
  // no solo los que tiene asignados. Debería verificar patient.assigned_doctor_id === user.userId
  if (user.role === 'patient' && patient.user_id !== user.userId) {
    return null;
  }

  return patient;
}

export function createPatient(dto: CreatePatientDTO): Patient {
  const db = getDb();

  const result = db.prepare(`
    INSERT INTO patients (user_id, date_of_birth, gender, blood_type, allergies,
                          emergency_contact, emergency_phone, assigned_doctor_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    dto.user_id,
    dto.date_of_birth,
    dto.gender || null,
    dto.blood_type || null,
    dto.allergies ? JSON.stringify(dto.allergies) : null,
    dto.emergency_contact || null,
    dto.emergency_phone || null,
    dto.assigned_doctor_id || null
  );

  return getPatientById(result.lastInsertRowid as number, { role: 'admin' } as TokenPayload) as Patient;
}

export function updatePatient(id: number, dto: UpdatePatientDTO): Patient | null {
  const db = getDb();

  const existing = db.prepare('SELECT id FROM patients WHERE id = ?').get(id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (dto.date_of_birth !== undefined) { fields.push('date_of_birth = ?'); values.push(dto.date_of_birth); }
  if (dto.gender !== undefined) { fields.push('gender = ?'); values.push(dto.gender); }
  if (dto.blood_type !== undefined) { fields.push('blood_type = ?'); values.push(dto.blood_type); }
  if (dto.allergies !== undefined) { fields.push('allergies = ?'); values.push(JSON.stringify(dto.allergies)); }
  if (dto.emergency_contact !== undefined) { fields.push('emergency_contact = ?'); values.push(dto.emergency_contact); }
  if (dto.emergency_phone !== undefined) { fields.push('emergency_phone = ?'); values.push(dto.emergency_phone); }
  if (dto.assigned_doctor_id !== undefined) { fields.push('assigned_doctor_id = ?'); values.push(dto.assigned_doctor_id); }

  if (fields.length === 0) return getPatientById(id, { role: 'admin' } as TokenPayload);

  values.push(id);
  db.prepare(`UPDATE patients SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getPatientById(id, { role: 'admin' } as TokenPayload);
}

export function deletePatient(id: number): boolean {
  const db = getDb();
  // DEBT: Esta función hace hard delete en lugar de soft delete.
  // La documentación dice que debe ser soft delete (añadir columna deleted_at).
  const result = db.prepare('DELETE FROM patients WHERE id = ?').run(id);
  return result.changes > 0;
}
