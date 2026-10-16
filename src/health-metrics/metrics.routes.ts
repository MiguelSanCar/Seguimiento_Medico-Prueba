import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { validateCreateMetric } from './metrics.validation';
import { canAccessPatient } from '../alerts/alerts.service';
import { getMetricsByPatient, getPatientSummary, createMetric } from './metrics.service';
import type { Request, Response } from 'express';

const router = Router();

router.get('/:patientId', authenticate, (req: Request, res: Response) => {
  const patientId = parseInt(req.params.patientId, 10);
  if (isNaN(patientId)) { res.status(400).json({ error: 'Invalid patientId' }); return; }

  if (!canAccessPatient(patientId, req.user!)) { res.status(404).json({ error: 'Patient not found' }); return; }

  const { type, dateFrom, dateTo } = req.query as Record<string, string>;

  try {
    const metrics = getMetricsByPatient(patientId, { type, dateFrom, dateTo });
    res.json({ data: metrics, count: metrics.length });
  } catch {
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

router.get('/:patientId/summary', authenticate, (req: Request, res: Response) => {
  const patientId = parseInt(req.params.patientId, 10);
  if (isNaN(patientId)) { res.status(400).json({ error: 'Invalid patientId' }); return; }

  if (!canAccessPatient(patientId, req.user!)) { res.status(404).json({ error: 'Patient not found' }); return; }

  try {
    const summary = getPatientSummary(patientId);
    res.json({ data: summary });
  } catch {
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

router.post('/', authenticate, (req: Request, res: Response) => {
  const error = validateCreateMetric(req.body);
  if (error) { res.status(400).json({ error }); return; }

  // admin, doctor asignado o el propio paciente; 404 sin distinguir inexistente de sin acceso
  const patientId = Number(req.body.patient_id);
  if (!Number.isInteger(patientId) || !canAccessPatient(patientId, req.user!)) {
    res.status(404).json({ error: 'Patient not found' });
    return;
  }

  try {
    const metric = createMetric(req.body, req.user!.userId);
    res.status(201).json({ data: metric });
  } catch {
    res.status(500).json({ error: 'Failed to create metric' });
  }
});

export default router;
