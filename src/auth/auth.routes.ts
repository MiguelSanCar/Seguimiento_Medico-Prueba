import { Router } from 'express';
import { registerUser, loginUser } from './auth.service';
import type { Request, Response } from 'express';

const router = Router();

router.post('/register', (req: Request, res: Response) => {
  const { email, password, name, role } = req.body;

  if (!email || !password || !name || !role) {
    res.status(400).json({ error: 'email, password, name and role are required' });
    return;
  }

  const validRoles = ['doctor', 'patient', 'admin'];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: 'role must be doctor, patient or admin' });
    return;
  }

  try {
    const result = registerUser({ email, password, name, role });
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
