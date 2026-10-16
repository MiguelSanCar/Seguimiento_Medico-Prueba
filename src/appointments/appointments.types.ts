export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled';

export interface Appointment {
  id: number;
  patient_id: number;
  doctor_id: number;
  date_time: string;
  duration_minutes: number;
  status: AppointmentStatus;
  reason: string | null;
  notes: string | null;
  created_at: string;
  // Campos join opcionales
  patient_name?: string;
  doctor_name?: string;
}

export interface CreateAppointmentDTO {
  patient_id: number;
  doctor_id: number;
  date_time: string;
  duration_minutes?: number;
  reason?: string;
}

export interface UpdateAppointmentDTO {
  date_time?: string;
  duration_minutes?: number;
  status?: AppointmentStatus;
  reason?: string;
  notes?: string;
}
