export function validateCreatePatient(body: Record<string, unknown>): string | null {
  if (!body.user_id) return 'user_id is required';
  if (!body.date_of_birth) return 'date_of_birth is required';

  const dobRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof body.date_of_birth !== 'string' || !dobRegex.test(body.date_of_birth)) {
    return 'date_of_birth must be in YYYY-MM-DD format';
  }

  const validGenders = ['male', 'female', 'other'];
  if (body.gender && !validGenders.includes(body.gender as string)) {
    return 'gender must be male, female or other';
  }

  const validBloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  if (body.blood_type && !validBloodTypes.includes(body.blood_type as string)) {
    return 'invalid blood_type';
  }

  return null;
}

export function validateUpdatePatient(body: Record<string, unknown>): string | null {
  if (body.date_of_birth) {
    const dobRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (typeof body.date_of_birth !== 'string' || !dobRegex.test(body.date_of_birth)) {
      return 'date_of_birth must be in YYYY-MM-DD format';
    }
  }

  const validGenders = ['male', 'female', 'other'];
  if (body.gender && !validGenders.includes(body.gender as string)) {
    return 'gender must be male, female or other';
  }

  const validBloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  if (body.blood_type && !validBloodTypes.includes(body.blood_type as string)) {
    return 'invalid blood_type';
  }

  return null;
}
