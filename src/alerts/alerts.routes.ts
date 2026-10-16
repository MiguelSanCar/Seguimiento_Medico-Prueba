import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { getAlertsByPatient, acknowledgeAlert } from './alerts.service';
import type { Request, Response } from 'express';

const router = Router();

function parseId(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

router.get('/:patientId', authenticate, (req: Request, res: Response) => {
  const patientId = parseId(req.params.patientId);
  if (patientId === null) { res.status(400).json({ error: 'Invalid patientId' }); return; }

  const { severity, acknowledged } = req.query;
  if (severity !== undefined && severity !== 'warning' && severity !== 'critical') {
    res.status(400).json({ error: 'severity must be one of: warning, critical' }); return;
  }
  let ack: boolean | undefined;
  if (acknowledged !== undefined) {
    if (acknowledged === 'true' || acknowledged === '1') ack = true;
    else if (acknowledged === 'false' || acknowledged === '0') ack = false;
    else { res.status(400).json({ error: 'acknowledged must be true or false' }); return; }
  }

  try {
    const alerts = getAlertsByPatient(patientId, req.user!, { severity, acknowledged: ack });
    if (!alerts) { res.status(404).json({ error: 'Patient not found' }); return; }
    res.json({ data: alerts, count: alerts.length });
  } catch {
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

router.patch('/:id/acknowledge', authenticate, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: 'Invalid id' }); return; }

  try {
    const alert = acknowledgeAlert(id, req.user!);
    if (!alert) { res.status(404).json({ error: 'Alert not found' }); return; }
    res.json({ data: alert });
  } catch {
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

export default router;
