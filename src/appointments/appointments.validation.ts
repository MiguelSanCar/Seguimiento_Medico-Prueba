export function validateCreateAppointment(body: Record<string, unknown>): string | null {
  if (!body.patient_id) return 'patient_id is required';
  if (!body.doctor_id) return 'doctor_id is required';
  if (!body.date_time) return 'date_time is required';

  const dtRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  if (typeof body.date_time !== 'string' || !dtRegex.test(body.date_time)) {
    return 'date_time must be ISO 8601 format (YYYY-MM-DDTHH:MM)';
  }

  if (body.duration_minutes !== undefined) {
    const dur = Number(body.duration_minutes);
    if (isNaN(dur) || dur < 5 || dur > 480) {
      return 'duration_minutes must be between 5 and 480';
    }
  }

  return null;
}

export function validateUpdateAppointment(body: Record<string, unknown>): string | null {
  if (body.date_time !== undefined) {
    const dtRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
    if (typeof body.date_time !== 'string' || !dtRegex.test(body.date_time)) {
      return 'date_time must be ISO 8601 format';
    }
  }

  const validStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled'];
  if (body.status && !validStatuses.includes(body.status as string)) {
    return 'invalid status';
  }

  return null;
}
