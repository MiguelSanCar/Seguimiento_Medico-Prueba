import Database from 'better-sqlite3';
import { setDb } from '../src/database/connection';
import { runMigrations } from '../src/database/migrations';
import bcrypt from 'bcrypt';
import { beforeAll, afterAll, beforeEach } from 'vitest';

let testDb: Database.Database;

beforeAll(() => {
  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  runMigrations(testDb);
  setDb(testDb);
});

beforeEach(() => {
  // Limpiar datos entre tests
  testDb.exec(`
    DELETE FROM audit_log;
    DELETE FROM notifications;
    DELETE FROM health_metrics;
    DELETE FROM appointments;
    DELETE FROM patients;
    DELETE FROM users;
    DELETE FROM sqlite_sequence;
  `);
});

afterAll(() => {
  testDb.close();
});

// Helper: crear usuario en DB directamente
export function createTestUser(params: {
  email: string;
  password: string;
  role: 'doctor' | 'patient' | 'admin';
  name: string;
}): number {
  const hash = bcrypt.hashSync(params.password, 1); // bcrypt rounds=1 para tests rápidos
  const result = testDb.prepare(
    'INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)'
  ).run(params.email, hash, params.role, params.name);
  return result.lastInsertRowid as number;
}

export function createTestPatient(params: {
  userId: number;
  doctorId?: number;
}): number {
  const result = testDb.prepare(`
    INSERT INTO patients (user_id, date_of_birth, gender, blood_type, assigned_doctor_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(params.userId, '1985-06-15', 'male', 'A+', params.doctorId ?? null);
  return result.lastInsertRowid as number;
}
