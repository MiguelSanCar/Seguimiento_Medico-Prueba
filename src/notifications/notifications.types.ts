export type NotificationType = 'metric_warning' | 'metric_critical' | 'appointment_reminder' | 'general';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface Notification {
  id: number;
  patient_id: number;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  read: number; // 0 o 1 (SQLite)
  related_metric_id: number | null;
  created_at: string;
  patient_name?: string;
}

export interface CreateNotificationDTO {
  patient_id: number;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  related_metric_id?: number;
}
