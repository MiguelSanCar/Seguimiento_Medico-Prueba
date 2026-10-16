import { Router } from 'express';
import { registerUser, loginUser } from './auth.service';
import type { Request, Response } from 'express';

const router = Router();

router.post('/register', (req: Request, res: Response) => {
  const { email, password, name, role = 'patient' } = req.body;

  if (!email || !password || !name) {
    res.status(400).json({ error: 'email, password and name are required' });
    return;
  }

  // El registro público solo crea pacientes; doctores y admins los da de alta un admin
  if (role !== 'patient') {
    res.status(403).json({ error: 'Public registration only allows the patient role' });
    return;
  }

  try {
    const result = registerUser({ email, password, name, role: 'patient' });
    res.status(201).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    if (message === 'Email already registered') {
      res.status(409).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  try {
    const result = loginUser({ email, password });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Login failed';
    if (message === 'Invalid credentials') {
      res.status(401).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

export default router;
