import { describe, it, expect } from 'vitest';
import { registerUser, loginUser } from '../src/auth/auth.service';
import { createTestUser } from './setup';

// DEBT: Solo se cubren happy paths. Faltan tests para:
// - Intentos de login con contraseñas incorrectas
// - Registro con emails duplicados
// - Tokens expirados
// - Roles no válidos

describe('Auth Service', () => {
  describe('registerUser', () => {
    it('should register a new user and return a token', () => {
      const result = registerUser({
        email: 'test@example.com',
        password: 'TestPass123!',
        name: 'Test User',
        role: 'patient',
      });

      expect(result.token).toBeTruthy();
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe('patient');
      expect((result.user as { password_hash?: string }).password_hash).toBeUndefined();
    });

    it('should throw if email already exists', () => {
      createTestUser({ email: 'existing@example.com', password: 'pass', role: 'patient', name: 'Existing' });

      expect(() => registerUser({
        email: 'existing@example.com',
        password: 'AnotherPass123!',
        name: 'Another User',
        role: 'patient',
      })).toThrow('Email already registered');
    });
  });

  describe('loginUser', () => {
    it('should login with valid credentials', () => {
      registerUser({ email: 'login@example.com', password: 'MyPass123!', name: 'Login User', role: 'doctor' });

      const result = loginUser({ email: 'login@example.com', password: 'MyPass123!' });

      expect(result.token).toBeTruthy();
      expect(result.user.email).toBe('login@example.com');
    });

    it('should throw on wrong password', () => {
      registerUser({ email: 'secure@example.com', password: 'CorrectPass123!', name: 'Secure User', role: 'patient' });

      expect(() => loginUser({ email: 'secure@example.com', password: 'WrongPass!' })).toThrow('Invalid credentials');
    });

    it('should throw for non-existent email', () => {
      expect(() => loginUser({ email: 'nobody@example.com', password: 'SomePass!' })).toThrow('Invalid credentials');
    });
  });
});
