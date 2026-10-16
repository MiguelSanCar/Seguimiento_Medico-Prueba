import type { MetricType } from '../health-metrics/metrics.types';

export type AlertSeverity = 'warning' | 'critical';

export interface Alert {
  id: number;
  patient_id: number;
  metric_id: number;
  metric_type: MetricType;
  value: number;
  severity: AlertSeverity;
  created_at: string;
  acknowledged: 0 | 1;
  acknowledged_by: number | null;
  acknowledged_at: string | null;
}

export interface CreateAlertDTO {
  patient_id: number;
  metric_id: number;
  metric_type: MetricType;
  value: number;
  severity: AlertSeverity;
}

export interface AlertFilters {
  severity?: AlertSeverity;
  acknowledged?: boolean;
}
