import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { validateCreateMetric } from './metrics.validation';
import { getMetricsByPatient, getPatientSummary, createMetric } from './metrics.service';
import type { Request, Response } from 'express';

const router = Router();

router.get('/:patientId', authenticate, (req: Request, res: Response) => {
  const patientId = parseInt(req.params.patientId, 10);
  if (isNaN(patientId)) { res.status(400).json({ error: 'Invalid patientId' }); return; }

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

  try {
    const metric = createMetric(req.body, req.user!.userId);
    res.status(201).json({ data: metric });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create metric';
    res.status(500).json({ error: message });
  }
});

export default router;
