import { Router } from 'express';
import { authenticate, authorize } from '../auth/auth.middleware';
import { validateCreateAppointment, validateUpdateAppointment } from './appointments.validation';
import {
  getAppointments, getAppointmentById, createAppointment, updateAppointment, cancelAppointment
} from './appointments.service';
import type { Request, Response } from 'express';

const router = Router();

router.get('/', authenticate, (req: Request, res: Response) => {
  try {
    const appointments = getAppointments(req.user!);
    res.json({ data: appointments, count: appointments.length });
  } catch {
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

router.get('/:id', authenticate, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  try {
    const appt = getAppointmentById(id, req.user!);
    if (!appt) { res.status(404).json({ error: 'Appointment not found' }); return; }
    res.json({ data: appt });
  } catch {
    res.status(500).json({ error: 'Failed to fetch appointment' });
  }
});

router.post('/', authenticate, authorize('admin', 'doctor'), (req: Request, res: Response) => {
  const error = validateCreateAppointment(req.body);
  if (error) { res.status(400).json({ error }); return; }

  try {
    const appt = createAppointment(req.body);
    res.status(201).json({ data: appt });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create appointment';
    res.status(500).json({ error: message });
  }
});

router.put('/:id', authenticate, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const error = validateUpdateAppointment(req.body);
  if (error) { res.status(400).json({ error }); return; }

  try {
    const appt = updateAppointment(id, req.body, req.user!);
    if (!appt) { res.status(404).json({ error: 'Appointment not found' }); return; }
    res.json({ data: appt });
  } catch {
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

router.delete('/:id', authenticate, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  try {
    const cancelled = cancelAppointment(id, req.user!);
    if (!cancelled) { res.status(404).json({ error: 'Appointment not found' }); return; }
    res.json({ message: 'Appointment cancelled' });
  } catch {
    res.status(500).json({ error: 'Failed to cancel appointment' });
  }
});

export default router;
