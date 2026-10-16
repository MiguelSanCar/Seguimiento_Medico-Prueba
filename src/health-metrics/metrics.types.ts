export type MetricType = 'blood_pressure' | 'glucose' | 'weight' | 'heart_rate' | 'temperature' | 'oxygen_saturation';

export interface HealthMetric {
  id: number;
  patient_id: number;
  metric_type: MetricType;
  value: number;
  secondary_value: number | null;
  unit: string;
  recorded_at: string;
  recorded_by: number | null;
  notes: string | null;
  created_at: string;
  recorded_by_name?: string;
}

export interface CreateMetricDTO {
  patient_id: number;
  metric_type: MetricType;
  value: number;
  secondary_value?: number;
  unit: string;
  recorded_at: string;
  notes?: string;
}

export interface MetricSummary {
  metric_type: MetricType;
  latest_value: number;
  latest_secondary_value: number | null;
  latest_recorded_at: string;
  avg_value: number;
  min_value: number;
  max_value: number;
  count: number;
  trend: 'rising' | 'falling' | 'stable';
  status: 'normal' | 'warning' | 'critical';
}

export interface MetricRange {
  normalMin: number;
  normalMax: number;
  warningMin?: number;
  warningMax?: number;
  criticalMin?: number;
  criticalMax?: number;
}
