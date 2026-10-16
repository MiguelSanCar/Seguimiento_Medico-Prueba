export type Role = 'doctor' | 'patient' | 'admin';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  role: Role;
  name: string;
  created_at: string;
}

export interface TokenPayload {
  userId: number;
  email: string;
  role: Role;
  name: string;
}

export interface RegisterDTO {
  email: string;
  password: string;
  name: string;
  role: Role;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: Omit<User, 'password_hash'>;
}
