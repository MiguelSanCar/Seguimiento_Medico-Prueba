import { getDb } from '../database/connection';
import type { Notification, CreateNotificationDTO } from './notifications.types';
import type { TokenPayload } from '../auth/auth.types';

export function createNotification(dto: CreateNotificationDTO): Notification {
  const db = getDb();

  const result = db.prepare(`
    INSERT INTO notifications (patient_id, type, title, message, severity, related_metric_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    dto.patient_id,
    dto.type,
    dto.title,
    dto.message,
    dto.severity,
    dto.related_metric_id ?? null
  );

  return db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid) as Notification;
}

export function getNotificationsForUser(user: TokenPayload): Notification[] {
  const db = getDb();

  if (user.role === 'admin') {
    return db.prepare(`
      SELECT n.*, u.name as patient_name
      FROM notifications n
      JOIN patients p ON n.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      ORDER BY n.created_at DESC
      LIMIT 100
    `).all() as Notification[];
  }

  if (user.role === 'doctor') {
    return db.prepare(`
      SELECT n.*, u.name as patient_name
      FROM notifications n
      JOIN patients p ON n.patient_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE p.assigned_doctor_id = ?
      ORDER BY n.created_at DESC
      LIMIT 100
    `).all(user.userId) as Notification[];
  }

  // patient
  return db.prepare(`
    SELECT n.*, u.name as patient_name
    FROM notifications n
    JOIN patients p ON n.patient_id = p.id
    JOIN users u ON p.user_id = u.id
    WHERE p.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 100
  `).all(user.userId) as Notification[];
}

export function getUnreadCount(user: TokenPayload): number {
  const db = getDb();

  if (user.role === 'admin') {
    const row = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0').get() as { count: number };
    return row.count;
  }

  if (user.role === 'doctor') {
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM notifications n
      JOIN patients p ON n.patient_id = p.id
      WHERE p.assigned_doctor_id = ? AND n.read = 0
    `).get(user.userId) as { count: number };
    return row.count;
  }

  const row = db.prepare(`
    SELECT COUNT(*) as count FROM notifications n
    JOIN patients p ON n.patient_id = p.id
    WHERE p.user_id = ? AND n.read = 0
  `).get(user.userId) as { count: number };
  return row.count;
}

export function markAsRead(notificationId: number, user: TokenPayload): boolean {
  const db = getDb();

  // Verificar que la notificación pertenece al usuario
  const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notificationId) as Notification | undefined;
  if (!notification) return false;

  if (user.role !== 'admin') {
    const patient = db.prepare('SELECT user_id, assigned_doctor_id FROM patients WHERE id = ?').get(notification.patient_id) as { user_id: number; assigned_doctor_id: number } | undefined;
    if (!patient) return false;
    if (user.role === 'patient' && patient.user_id !== user.userId) return false;
    if (user.role === 'doctor' && patient.assigned_doctor_id !== user.userId) return false;
  }

  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(notificationId);
  return true;
}
