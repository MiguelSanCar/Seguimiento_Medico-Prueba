import { Router } from 'express';
import { authenticate, authorize } from '../auth/auth.middleware';
import { validateCreatePatient, validateUpdatePatient } from './patients.validation';
import {
  getPatients, getPatientById, createPatient, updatePatient, deletePatient
} from './patients.service';
import type { Request, Response } from 'express';

const router = Router();

router.get('/', authenticate, (req: Request, res: Response) => {
  try {
    const patients = getPatients(req.user!);
    res.json({ data: patients, count: patients.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

router.get('/:id', authenticate, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid patient id' }); return; }

  try {
    const patient = getPatientById(id, req.user!);
    if (!patient) { res.status(404).json({ error: 'Patient not found' }); return; }
    res.json({ data: patient });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
});

router.post('/', authenticate, authorize('admin', 'doctor'), (req: Request, res: Response) => {
  const error = validateCreatePatient(req.body);
  if (error) { res.status(400).json({ error }); return; }

  try {
    const patient = createPatient(req.body);
    res.status(201).json({ data: patient });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create patient';
    res.status(500).json({ error: message });
  }
});

router.put('/:id', authenticate, authorize('admin', 'doctor'), (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid patient id' }); return; }

  const error = validateUpdatePatient(req.body);
  if (error) { res.status(400).json({ error }); return; }

  try {
    const patient = updatePatient(id, req.body);
    if (!patient) { res.status(404).json({ error: 'Patient not found' }); return; }
    res.json({ data: patient });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update patient' });
  }
});

router.delete('/:id', authenticate, authorize('admin'), (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid patient id' }); return; }

  try {
    const deleted = deletePatient(id);
    if (!deleted) { res.status(404).json({ error: 'Patient not found' }); return; }
    res.json({ message: 'Patient deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete patient' });
  }
});

export default router;
