import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { getNotificationsForUser, getUnreadCount, markAsRead } from './notifications.service';
import type { Request, Response } from 'express';

const router = Router();

router.get('/', authenticate, (req: Request, res: Response) => {
  try {
    const notifications = getNotificationsForUser(req.user!);
    res.json({ data: notifications, count: notifications.length });
  } catch {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.get('/unread-count', authenticate, (req: Request, res: Response) => {
  try {
    const count = getUnreadCount(req.user!);
    res.json({ count });
  } catch {
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

router.patch('/:id/read', authenticate, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  try {
    const success = markAsRead(id, req.user!);
    if (!success) { res.status(404).json({ error: 'Notification not found' }); return; }
    res.json({ message: 'Marked as read' });
  } catch {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

export default router;
