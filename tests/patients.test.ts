import { describe, it, expect } from 'vitest';
import { getPatients, getPatientById, createPatient, deletePatient } from '../src/patients/patients.service';
import { createTestUser, createTestPatient } from './setup';
import type { TokenPayload } from '../src/auth/auth.types';

// DEBT: Faltan tests para:
// - Verificar que un doctor NO puede ver pacientes de otro doctor (bug de seguridad)
// - Inputs con caracteres especiales / SQL injection
// - Fechas de nacimiento inválidas
// - Paginación cuando hay muchos pacientes

describe('Patients Service', () => {
  describe('getPatients', () => {
    it('should return all patients for admin', () => {
      const adminUser = createTestUser({ email: 'admin@test.com', password: 'pass', role: 'admin', name: 'Admin' });
      const patUser1 = createTestUser({ email: 'p1@test.com', password: 'pass', role: 'patient', name: 'Pat 1' });
      const patUser2 = createTestUser({ email: 'p2@test.com', password: 'pass', role: 'patient', name: 'Pat 2' });
      createTestPatient({ userId: patUser1 });
      createTestPatient({ userId: patUser2 });

      const adminPayload: TokenPayload = { userId: adminUser, email: 'admin@test.com', role: 'admin', name: 'Admin' };
      const patients = getPatients(adminPayload);

      expect(patients).toHaveLength(2);
    });

    it('should return only assigned patients for a doctor', () => {
      const doctorUser = createTestUser({ email: 'doc@test.com', password: 'pass', role: 'doctor', name: 'Doctor' });
      const otherDoctor = createTestUser({ email: 'doc2@test.com', password: 'pass', role: 'doctor', name: 'Doctor 2' });
      const patUser1 = createTestUser({ email: 'p1@test.com', password: 'pass', role: 'patient', name: 'Pat 1' });
      const patUser2 = createTestUser({ email: 'p2@test.com', password: 'pass', role: 'patient', name: 'Pat 2' });

      createTestPatient({ userId: patUser1, doctorId: doctorUser });
      createTestPatient({ userId: patUser2, doctorId: otherDoctor }); // otro doctor

      const doctorPayload: TokenPayload = { userId: doctorUser, email: 'doc@test.com', role: 'doctor', name: 'Doctor' };
      const patients = getPatients(doctorPayload);

      expect(patients).toHaveLength(1);
    });
  });

  describe('createPatient', () => {
    it('should create a patient with allergies as JSON', () => {
      const userDoctor = createTestUser({ email: 'doc@test.com', password: 'pass', role: 'doctor', name: 'Doctor' });
      const userPatient = createTestUser({ email: 'pat@test.com', password: 'pass', role: 'patient', name: 'Patient' });

      const patient = createPatient({
        user_id: userPatient,
        date_of_birth: '1990-05-20',
        gender: 'female',
        blood_type: 'O+',
        allergies: ['Penicilina', 'Aspirina'],
        assigned_doctor_id: userDoctor,
      });

      expect(patient.id).toBeDefined();
      expect(patient.blood_type).toBe('O+');
      // allergies se almacena como JSON string
      const allergies = JSON.parse(patient.allergies as string);
      expect(allergies).toContain('Penicilina');
    });
  });

  describe('deletePatient', () => {
    it('should delete existing patient', () => {
      const userPatient = createTestUser({ email: 'pat@test.com', password: 'pass', role: 'patient', name: 'Patient' });
      const patientId = createTestPatient({ userId: userPatient });

      const result = deletePatient(patientId);
      expect(result).toBe(true);

      // Confirmar que ya no existe
      const adminPayload: TokenPayload = { userId: 1, email: '', role: 'admin', name: '' };
      const found = getPatientById(patientId, adminPayload);
      expect(found).toBeNull();
    });

    it('should return false for non-existent patient', () => {
      const result = deletePatient(99999);
      expect(result).toBe(false);
    });
  });
});
