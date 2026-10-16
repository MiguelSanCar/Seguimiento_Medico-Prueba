import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getDb } from '../database/connection';
import { config } from '../config';
import type { User, RegisterDTO, LoginDTO, AuthResponse, TokenPayload } from './auth.types';

export function registerUser(dto: RegisterDTO): AuthResponse {
  const db = getDb();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(dto.email);
  if (existing) {
    throw new Error('Email already registered');
  }

  const passwordHash = bcrypt.hashSync(dto.password, config.bcryptRounds);

  const result = db.prepare(
    'INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)'
  ).run(dto.email, passwordHash, dto.role, dto.name);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User;

  const token = generateToken(user);
  const { password_hash, ...userWithoutPassword } = user;

  return { token, user: userWithoutPassword };
}

export function loginUser(dto: LoginDTO): AuthResponse {
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(dto.email) as User | undefined;
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const validPassword = bcrypt.compareSync(dto.password, user.password_hash);
  if (!validPassword) {
    throw new Error('Invalid credentials');
  }

  const token = generateToken(user);
  const { password_hash, ...userWithoutPassword } = user;

  return { token, user: userWithoutPassword };
}

function generateToken(user: User): string {
  const payload: TokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  };
  // DEBT: config.jwtSecret debería venir de process.env.JWT_SECRET (ver config.ts)
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '24h' });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
}
