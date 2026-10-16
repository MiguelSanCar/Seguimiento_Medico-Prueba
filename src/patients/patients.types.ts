export interface Patient {
  id: number;
  user_id: number;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other' | null;
  blood_type: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | null;
  allergies: string | null; // JSON array serializado
  emergency_contact: string | null;
  emergency_phone: string | null;
  assigned_doctor_id: number | null;
  created_at: string;
  // Campos join opcionales
  name?: string;
  email?: string;
  doctor_name?: string;
}

export interface CreatePatientDTO {
  user_id: number;
  date_of_birth: string;
  gender?: 'male' | 'female' | 'other';
  blood_type?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  allergies?: string[];
  emergency_contact?: string;
  emergency_phone?: string;
  assigned_doctor_id?: number;
}

export interface UpdatePatientDTO {
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other';
  blood_type?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  allergies?: string[];
  emergency_contact?: string;
  emergency_phone?: string;
  assigned_doctor_id?: number;
}
