import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import path from 'path';
import { runMigrations } from './migrations';

const DB_PATH = process.env.DB_PATH || 'healthtrack.db';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
runMigrations(db);

// Limpiar datos existentes manteniendo el esquema
db.exec(`
  DELETE FROM audit_log;
  DELETE FROM notifications;
  DELETE FROM health_metrics;
  DELETE FROM appointments;
  DELETE FROM patients;
  DELETE FROM users;
  DELETE FROM sqlite_sequence;
`);

const BCRYPT_ROUNDS = 10;

console.log('🌱 Sembrando base de datos...');

// ── USUARIOS ──────────────────────────────────────────────────────────────────

const insertUser = db.prepare(
  'INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)'
);

// Doctores
const drMartinez = insertUser.run('elena.martinez@healthtrack.com', bcrypt.hashSync('Doctor123!', BCRYPT_ROUNDS), 'doctor', 'Dra. Elena Martínez');
const drChen = insertUser.run('james.chen@healthtrack.com', bcrypt.hashSync('Doctor123!', BCRYPT_ROUNDS), 'doctor', 'Dr. James Chen');
const drOkonkwo = insertUser.run('sarah.okonkwo@healthtrack.com', bcrypt.hashSync('Doctor123!', BCRYPT_ROUNDS), 'doctor', 'Dra. Sarah Okonkwo');

// Admin
const admin = insertUser.run('admin@healthtrack.com', bcrypt.hashSync('Admin123!', BCRYPT_ROUNDS), 'admin', 'Administrador Sistema');

// Pacientes (usuarios)
const uCarlos = insertUser.run('carlos.ruiz@email.com', bcrypt.hashSync('Patient123!', BCRYPT_ROUNDS), 'patient', 'Carlos Ruiz');
const uAna = insertUser.run('ana.garcia@email.com', bcrypt.hashSync('Patient123!', BCRYPT_ROUNDS), 'patient', 'Ana García');
const uMiguel = insertUser.run('miguel.torres@email.com', bcrypt.hashSync('Patient123!', BCRYPT_ROUNDS), 'patient', 'Miguel Torres');
const uSofia = insertUser.run('sofia.rodriguez@email.com', bcrypt.hashSync('Patient123!', BCRYPT_ROUNDS), 'patient', 'Sofía Rodríguez');
const uDavid = insertUser.run('david.kim@email.com', bcrypt.hashSync('Patient123!', BCRYPT_ROUNDS), 'patient', 'David Kim');
const uMaria = insertUser.run('maria.santos@email.com', bcrypt.hashSync('Patient123!', BCRYPT_ROUNDS), 'patient', 'María Santos');
const uThomas = insertUser.run('thomas.weber@email.com', bcrypt.hashSync('Patient123!', BCRYPT_ROUNDS), 'patient', 'Thomas Weber');
const uLaura = insertUser.run('laura.fernandez@email.com', bcrypt.hashSync('Patient123!', BCRYPT_ROUNDS), 'patient', 'Laura Fernández');

console.log('✅ Usuarios creados');

// ── PACIENTES ─────────────────────────────────────────────────────────────────

const insertPatient = db.prepare(`
  INSERT INTO patients (user_id, date_of_birth, gender, blood_type, allergies, emergency_contact, emergency_phone, assigned_doctor_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// Paciente 1: Carlos Ruiz — presión arterial en subida (hipertensión incipiente)
const pCarlos = insertPatient.run(uCarlos.lastInsertRowid, '1965-03-15', 'male', 'A+',
  JSON.stringify(['Penicilina', 'Aspirina']), 'Rosa Ruiz', '+34 612 345 678', drMartinez.lastInsertRowid);

// Paciente 2: Ana García — glucosa estable con picos esporádicos
const pAna = insertPatient.run(uAna.lastInsertRowid, '1978-07-22', 'female', 'B+',
  JSON.stringify(['Sulfonamidas']), 'Pedro García', '+34 623 456 789', drOkonkwo.lastInsertRowid);

// Paciente 3: Miguel Torres — peso descendente constante
const pMiguel = insertPatient.run(uMiguel.lastInsertRowid, '1990-11-08', 'male', 'O-',
  JSON.stringify([]), 'Carmen Torres', '+34 634 567 890', drChen.lastInsertRowid);

// Paciente 4: Sofía Rodríguez — todos los valores normales
const pSofia = insertPatient.run(uSofia.lastInsertRowid, '1985-04-30', 'female', 'AB+',
  JSON.stringify(['Látex']), 'Marco Rodríguez', '+34 645 678 901', drMartinez.lastInsertRowid);

// Paciente 5: David Kim — frecuencia cardíaca variable
const pDavid = insertPatient.run(uDavid.lastInsertRowid, '1972-09-14', 'male', 'A-',
  JSON.stringify(['Ibuprofeno', 'Codeína']), 'Jenny Kim', '+34 656 789 012', drChen.lastInsertRowid);

// Paciente 6: María Santos — temperatura y saturación O2
const pMaria = insertPatient.run(uMaria.lastInsertRowid, '1955-12-03', 'female', 'O+',
  JSON.stringify(['Contraste yodado']), 'José Santos', '+34 667 890 123', drOkonkwo.lastInsertRowid);

// Paciente 7: Thomas Weber — glucosa diabética controlada
const pThomas = insertPatient.run(uThomas.lastInsertRowid, '1968-06-25', 'male', 'B-',
  JSON.stringify(['Metformina (intolerancia)', 'Sulfonilureas']), 'Anna Weber', '+34 678 901 234', drOkonkwo.lastInsertRowid);

// Paciente 8: Laura Fernández — valores generalmente normales con algunas variaciones
const pLaura = insertPatient.run(uLaura.lastInsertRowid, '1995-02-18', 'female', 'A+',
  JSON.stringify([]), 'Pablo Fernández', '+34 689 012 345', drMartinez.lastInsertRowid);

console.log('✅ Pacientes creados');

// ── HELPERS ───────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 19);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 19);
}

function dateAt(daysOffset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString().slice(0, 19);
}

// ── CITAS ─────────────────────────────────────────────────────────────────────

const insertAppt = db.prepare(`
  INSERT INTO appointments (patient_id, doctor_id, date_time, duration_minutes, status, reason, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const drMId = drMartinez.lastInsertRowid;
const drCId = drChen.lastInsertRowid;
const drOId = drOkonkwo.lastInsertRowid;

const pCId = pCarlos.lastInsertRowid;
const pAId = pAna.lastInsertRowid;
const pMId = pMiguel.lastInsertRowid;
const pSId = pSofia.lastInsertRowid;
const pDId = pDavid.lastInsertRowid;
const pMrId = pMaria.lastInsertRowid;
const pTId = pThomas.lastInsertRowid;
const pLId = pLaura.lastInsertRowid;

// Carlos - control de presión
insertAppt.run(pCId, drMId, daysAgo(120), 30, 'completed', 'Control tensión arterial', 'PA ligeramente elevada. Iniciar monitoreo en casa.');
insertAppt.run(pCId, drMId, daysAgo(90), 30, 'completed', 'Revisión presión arterial', 'PA 130/85. Recomendar dieta baja en sodio.');
insertAppt.run(pCId, drMId, daysAgo(60), 30, 'completed', 'Seguimiento hipertensión', 'PA 135/88. Valorar inicio de medicación.');
insertAppt.run(pCId, drMId, daysAgo(30), 45, 'completed', 'Evaluación cardiovascular', 'Prescripción antihipertensivo. Losartán 50mg/día.');
insertAppt.run(pCId, drMId, dateAt(7, 10, 0), 30, 'scheduled', 'Control post-medicación', null);
insertAppt.run(pCId, drMId, dateAt(37, 10, 30), 30, 'scheduled', 'Revisión mensual', null);

// Ana - control glucemia
insertAppt.run(pAId, drOId, daysAgo(100), 45, 'completed', 'Análisis glucosa en ayunas', 'HbA1c 5.8%. Pre-diabetes borderline. Dieta y ejercicio.');
insertAppt.run(pAId, drOId, daysAgo(70), 30, 'completed', 'Seguimiento glucemia', 'Picos postprandiales. Ajuste dieta.');
insertAppt.run(pAId, drOId, daysAgo(40), 30, 'completed', 'Revisión dieta diabética', 'Mejora notable. Continuar plan.');
insertAppt.run(pAId, drOId, dateAt(14, 9, 0), 45, 'confirmed', 'Control trimestral HbA1c', null);
insertAppt.run(pAId, drOId, dateAt(45, 9, 30), 30, 'scheduled', 'Revisión resultados analítica', null);

// Miguel - control peso
insertAppt.run(pMId, drCId, daysAgo(150), 60, 'completed', 'Evaluación plan adelgazamiento', 'IMC 32. Diseño programa pérdida de peso.');
insertAppt.run(pMId, drCId, daysAgo(110), 30, 'completed', 'Seguimiento nutricional', 'Perdidos 3.2kg. Buen ritmo.');
insertAppt.run(pMId, drCId, daysAgo(70), 30, 'completed', 'Control mensual peso', 'Pérdida acumulada 7kg. Excelente progreso.');
insertAppt.run(pMId, drCId, daysAgo(35), 30, 'completed', 'Revisión composición corporal', 'Pérdida 11kg total. Ajustar objetivos.');
insertAppt.run(pMId, drCId, dateAt(10, 11, 0), 30, 'scheduled', 'Control mensual', null);

// Sofía - chequeos rutinarios
insertAppt.run(pSId, drMId, daysAgo(180), 60, 'completed', 'Chequeo general anual', 'Todos los parámetros normales. Excelente salud.');
insertAppt.run(pSId, drMId, daysAgo(90), 30, 'completed', 'Revisión semestral', 'Sin cambios. Mantener hábitos saludables.');
insertAppt.run(pSId, drMId, dateAt(20, 12, 0), 60, 'scheduled', 'Chequeo anual', null);
insertAppt.run(pSId, drMId, dateAt(50, 12, 30), 30, 'scheduled', 'Revisión analítica', null);

// David - control cardíaco
insertAppt.run(pDId, drCId, daysAgo(95), 45, 'completed', 'Evaluación arritmia ocasional', 'Holter 24h solicitado. Monitoreo continuo.');
insertAppt.run(pDId, drCId, daysAgo(65), 30, 'completed', 'Resultados Holter', 'Extrasístoles benignas. Sin tratamiento por ahora.');
insertAppt.run(pDId, drCId, daysAgo(35), 30, 'completed', 'Control follow-up', 'Estable. Evitar estimulantes.');
insertAppt.run(pDId, drCId, dateAt(5, 15, 0), 30, 'confirmed', 'Revisión cardíaca', null);

// María - control respiratorio
insertAppt.run(pMrId, drOId, daysAgo(80), 45, 'completed', 'Evaluación EPOC leve', 'FEV1/FVC 0.68. Iniciar broncodilatador.');
insertAppt.run(pMrId, drOId, daysAgo(50), 30, 'completed', 'Control saturación O2', 'SpO2 promedio 93%. Oxigenoterapia no indicada aún.');
insertAppt.run(pMrId, drOId, daysAgo(20), 45, 'completed', 'Revisión respiratoria', 'Empeoramiento leve. Ajuste medicación.');
insertAppt.run(pMrId, drOId, dateAt(3, 10, 0), 45, 'confirmed', 'Control urgente', null);
insertAppt.run(pMrId, drOId, dateAt(33, 10, 0), 30, 'scheduled', 'Revisión mensual', null);

// Thomas - diabetes tipo 2
insertAppt.run(pTId, drOId, daysAgo(110), 60, 'completed', 'Diagnóstico diabetes tipo 2', 'Glucosa 178 mg/dL ayunas. Iniciar tratamiento.');
insertAppt.run(pTId, drOId, daysAgo(80), 45, 'completed', 'Ajuste insulina', 'Titulación insulina basal. HbA1c 8.2%.');
insertAppt.run(pTId, drOId, daysAgo(50), 30, 'completed', 'Control glucémico', 'Mejora. HbA1c 7.4%.');
insertAppt.run(pTId, drOId, daysAgo(20), 30, 'completed', 'Revisión complicaciones', 'Fondo ojo y microalbuminuria normales.');
insertAppt.run(pTId, drOId, dateAt(12, 9, 0), 45, 'scheduled', 'Control trimestral', null);

// Laura - general
insertAppt.run(pLId, drMId, daysAgo(60), 30, 'completed', 'Revisión general', 'Saludable. Sin incidencias.');
insertAppt.run(pLId, drMId, daysAgo(15), 30, 'cancelled', 'Revisión preventiva', null);
insertAppt.run(pLId, drMId, dateAt(25, 16, 0), 30, 'scheduled', 'Chequeo anual', null);

console.log('✅ Citas creadas');

// ── MÉTRICAS DE SALUD ─────────────────────────────────────────────────────────

const insertMetric = db.prepare(`
  INSERT INTO health_metrics (patient_id, metric_type, value, secondary_value, unit, recorded_at, recorded_by, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// ── Carlos: Presión arterial en subida gradual (hipertensión incipiente) ──
// Sistólica empieza en ~118 y llega a ~145 en 6 meses
const carlosPA = [
  [118, 76, -175], [120, 78, -168], [119, 77, -161], [122, 79, -154],
  [121, 78, -147], [123, 80, -140], [124, 81, -133], [125, 80, -126],
  [126, 82, -119], [128, 83, -112], [127, 82, -105], [129, 84, -98],
  [130, 83, -91], [131, 85, -84], [132, 84, -77], [133, 86, -70],
  [134, 85, -63], [135, 87, -56], [137, 86, -49], [138, 88, -42],
  [139, 89, -35], [140, 90, -28], [142, 91, -21], [143, 90, -14],
  [144, 92, -7], [145, 93, -2],
];
carlosPA.forEach(([sys, dia, offset]) => {
  const hour = 8 + Math.floor(Math.random() * 3);
  insertMetric.run(pCId, 'blood_pressure', sys, dia, 'mmHg', dateAt(offset, hour), drMId, null);
});

// Ritmo cardíaco de Carlos
[[72, -180], [74, -150], [71, -120], [76, -90], [78, -60], [75, -30], [77, -5]].forEach(([hr, offset]) => {
  insertMetric.run(pCId, 'heart_rate', hr, null, 'bpm', dateAt(offset, 9), drMId, null);
});

// ── Ana: Glucosa estable con picos esporádicos ──
const anaGlucose = [
  [88, -170], [92, -163], [86, -156], [95, -149], [89, -142], [91, -135],
  [94, -128], [87, -121], [93, -114], [90, -107], [88, -100], [132, -95], // pico
  [92, -90], [89, -83], [94, -76], [91, -69], [88, -62], [96, -55],
  [90, -48], [93, -41], [87, -34], [128, -29], // pico
  [91, -27], [89, -20], [94, -13], [92, -6], [90, -1],
];
anaGlucose.forEach(([val, offset]) => {
  const notes = val > 120 ? 'Pico post-prandial. Posible transgresión dieta.' : null;
  insertMetric.run(pAId, 'glucose', val, null, 'mg/dL', dateAt(offset, 7, 30), drOId, notes);
});

// Peso de Ana
[[68, -180], [67.5, -120], [67.8, -60], [68.2, -20]].forEach(([val, offset]) => {
  insertMetric.run(pAId, 'weight', val, null, 'kg', dateAt(offset, 9), drOId, null);
});

// ── Miguel: Peso descendente constante ──
const miguelWeight = [
  [98.5, -170], [97.8, -158], [97.2, -146], [96.5, -134], [95.8, -122],
  [95.1, -110], [94.4, -98], [93.7, -86], [93.0, -74], [92.2, -62],
  [91.5, -50], [90.8, -38], [90.1, -26], [89.3, -14], [88.7, -3],
];
miguelWeight.forEach(([val, offset]) => {
  const imc = val / (1.82 * 1.82);
  insertMetric.run(pMId, 'weight', val, null, 'kg', dateAt(offset, 8), drCId,
    `IMC: ${imc.toFixed(1)}`);
});

// Glucosa de Miguel
[[92, -170], [89, -120], [94, -70], [91, -20]].forEach(([val, offset]) => {
  insertMetric.run(pMId, 'glucose', val, null, 'mg/dL', dateAt(offset, 7, 30), drCId, null);
});

// ── Sofía: Todos los valores normales ──
const sofiaMetrics: [number, number | null, string, string, number][] = [
  [115, 75, 'blood_pressure', 'mmHg', -180], [113, 74, 'blood_pressure', 'mmHg', -150],
  [117, 76, 'blood_pressure', 'mmHg', -120], [114, 74, 'blood_pressure', 'mmHg', -90],
  [116, 75, 'blood_pressure', 'mmHg', -60], [115, 76, 'blood_pressure', 'mmHg', -30],
  [116, 75, 'blood_pressure', 'mmHg', -5],
  [85, null, 'glucose', 'mg/dL', -180], [82, null, 'glucose', 'mg/dL', -120],
  [87, null, 'glucose', 'mg/dL', -60], [84, null, 'glucose', 'mg/dL', -10],
  [62, null, 'heart_rate', 'bpm', -180], [65, null, 'heart_rate', 'bpm', -120],
  [63, null, 'heart_rate', 'bpm', -60], [64, null, 'heart_rate', 'bpm', -10],
  [36.6, null, 'temperature', '°C', -180], [36.7, null, 'temperature', '°C', -90],
  [36.5, null, 'temperature', '°C', -30], [36.8, null, 'temperature', '°C', -5],
  [98, null, 'oxygen_saturation', '%', -180], [97, null, 'oxygen_saturation', '%', -90],
  [98, null, 'oxygen_saturation', '%', -30], [99, null, 'oxygen_saturation', '%', -5],
  [63, null, 'weight', 'kg', -180], [63, null, 'weight', 'kg', -90], [62.5, null, 'weight', 'kg', -10],
];
sofiaMetrics.forEach(([val, sec, type, unit, offset]) => {
  insertMetric.run(pSId, type, val, sec, unit, dateAt(offset, 10), drMId, null);
});

// ── David: Frecuencia cardíaca variable, con episodios ──
const davidHR = [
  [72, -180], [74, -170], [68, -160], [125, -155], // episodio
  [76, -150], [72, -140], [70, -130], [74, -120], [78, -110],
  [71, -100], [73, -90], [75, -80], [122, -75], // episodio
  [74, -70], [72, -60], [76, -50], [73, -40],
  [70, -30], [74, -20], [72, -10], [75, -3],
];
davidHR.forEach(([val, offset]) => {
  const notes = val > 120 ? 'Palpitaciones referidas. ECG normal durante episodio.' : null;
  insertMetric.run(pDId, 'heart_rate', val, null, 'bpm', dateAt(offset, 14), drCId, notes);
});

// Presión de David
[[118, 76, -170], [122, 78, -120], [120, 77, -70], [119, 76, -20]].forEach(([sys, dia, offset]) => {
  insertMetric.run(pDId, 'blood_pressure', sys, dia, 'mmHg', dateAt(offset, 10), drCId, null);
});

// ── María: O2 baja y temperatura variable ──
const mariaO2 = [
  [93, -170], [92, -158], [94, -146], [91, -134], [93, -122],
  [90, -110], [89, -100], [92, -88], [91, -76], [88, -64], // warning
  [90, -52], [87, -40], // critical
  [89, -28], [91, -16], [88, -7], [86, -3], // critical
];
mariaO2.forEach(([val, offset]) => {
  const notes = val < 90 ? 'SpO2 crítica. Evaluación urgente requerida.' : val < 92 ? 'SpO2 reducida. Monitoreo cercano.' : null;
  insertMetric.run(pMrId, 'oxygen_saturation', val, null, '%', dateAt(offset, 9), drOId, notes);
});

const mariaTemp = [
  [36.8, -170], [36.9, -140], [37.1, -110], [37.4, -80], [37.8, -65],
  [38.2, -55], // critical
  [37.6, -45], [37.3, -35], [37.8, -20], [38.1, -10], [37.9, -3], // critical
];
mariaTemp.forEach(([val, offset]) => {
  const notes = val > 38.0 ? 'Fiebre. Posible infección respiratoria.' : null;
  insertMetric.run(pMrId, 'temperature', val, null, '°C', dateAt(offset, 8), drOId, notes);
});

// ── Thomas: Glucosa diabética controlada ──
const thomasGlucose = [
  [178, -165], [182, -158], [168, -151], [175, -144], [172, -137],
  [165, -130], [159, -123], [162, -116], [155, -109], [148, -102],
  [152, -95], [145, -88], [149, -81], [142, -74], [138, -67],
  [144, -60], [136, -53], [132, -46], [129, -39], [135, -32],
  [128, -25], [122, -18], [119, -11], [115, -5], [118, -2],
];
thomasGlucose.forEach(([val, offset]) => {
  insertMetric.run(pTId, 'glucose', val, null, 'mg/dL', dateAt(offset, 7, 0), drOId,
    val > 140 ? 'Glucosa elevada. Revisar dosis insulina.' : null);
});

// Peso de Thomas
[[85, -165], [84.5, -120], [84, -80], [83.5, -40], [83, -5]].forEach(([val, offset]) => {
  insertMetric.run(pTId, 'weight', val, null, 'kg', dateAt(offset, 9), drOId, null);
});

// ── Laura: Valores generalmente normales ──
const lauraMetrics: [number, number | null, string, string, number][] = [
  [112, 72, 'blood_pressure', 'mmHg', -160], [110, 70, 'blood_pressure', 'mmHg', -90],
  [108, 68, 'blood_pressure', 'mmHg', -40], [111, 71, 'blood_pressure', 'mmHg', -7],
  [78, null, 'glucose', 'mg/dL', -160], [80, null, 'glucose', 'mg/dL', -90],
  [82, null, 'glucose', 'mg/dL', -40], [79, null, 'glucose', 'mg/dL', -7],
  [68, null, 'heart_rate', 'bpm', -160], [70, null, 'heart_rate', 'bpm', -90],
  [65, null, 'heart_rate', 'bpm', -40], [72, null, 'heart_rate', 'bpm', -7],
  [36.7, null, 'temperature', '°C', -90], [36.8, null, 'temperature', '°C', -30],
  [36.6, null, 'temperature', '°C', -7],
  [99, null, 'oxygen_saturation', '%', -90], [98, null, 'oxygen_saturation', '%', -30],
  [99, null, 'oxygen_saturation', '%', -7],
  [57, null, 'weight', 'kg', -160], [57, null, 'weight', 'kg', -90],
  [56.5, null, 'weight', 'kg', -30], [56, null, 'weight', 'kg', -7],
];
lauraMetrics.forEach(([val, sec, type, unit, offset]) => {
  insertMetric.run(pLId, type, val, sec, unit, dateAt(offset, 10), drMId, null);
});

console.log('✅ Métricas de salud creadas');

// ── NOTIFICACIONES ────────────────────────────────────────────────────────────

const insertNotif = db.prepare(`
  INSERT INTO notifications (patient_id, type, title, message, severity, read, related_metric_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// Carlos - alertas de presión
insertNotif.run(pCId, 'metric_warning', 'Presión arterial elevada', 'Nivel de blood pressure fuera de rango normal', 'warning', 1, null, daysAgo(28));
insertNotif.run(pCId, 'metric_critical', 'Presión arterial crítica', 'Nivel de blood pressure fuera de rango normal', 'critical', 0, null, daysAgo(2));
insertNotif.run(pCId, 'appointment_reminder', 'Cita próxima', 'Tiene una cita programada en 7 días con Dra. Elena Martínez', 'info', 0, null, daysAgo(0));

// Ana - alertas de glucosa
insertNotif.run(pAId, 'metric_warning', 'Glucosa elevada', 'Nivel de glucose fuera de rango normal', 'warning', 1, null, daysAgo(29));
insertNotif.run(pAId, 'metric_warning', 'Glucosa elevada', 'Nivel de glucose fuera de rango normal', 'warning', 0, null, daysAgo(6));

// María - alertas críticas
insertNotif.run(pMrId, 'metric_critical', 'Saturación O2 crítica', 'Nivel de oxygen saturation fuera de rango normal', 'critical', 0, null, daysAgo(3));
insertNotif.run(pMrId, 'metric_critical', 'Temperatura crítica', 'Nivel de temperature fuera de rango normal', 'critical', 0, null, daysAgo(3));
insertNotif.run(pMrId, 'metric_warning', 'Saturación O2 baja', 'Nivel de oxygen saturation fuera de rango normal', 'warning', 1, null, daysAgo(40));

// Thomas - alertas glucosa
insertNotif.run(pTId, 'metric_critical', 'Glucosa muy elevada', 'Nivel de glucose fuera de rango normal', 'critical', 1, null, daysAgo(160));
insertNotif.run(pTId, 'metric_warning', 'Glucosa elevada', 'Nivel de glucose fuera de rango normal', 'warning', 0, null, daysAgo(30));

// David - alertas cardíacas
insertNotif.run(pDId, 'metric_critical', 'Frecuencia cardíaca alta', 'Nivel de heart rate fuera de rango normal', 'critical', 1, null, daysAgo(75));
insertNotif.run(pDId, 'metric_critical', 'Frecuencia cardíaca alta', 'Nivel de heart rate fuera de rango normal', 'critical', 0, null, daysAgo(3));

console.log('✅ Notificaciones creadas');

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────

const insertAudit = db.prepare(`
  INSERT INTO audit_log (user_id, action, resource, resource_id, details, ip_address, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const adminId = admin.lastInsertRowid;

insertAudit.run(adminId, 'POST', 'auth', null, JSON.stringify({ action: 'register' }), '127.0.0.1', daysAgo(90));
insertAudit.run(drMId, 'POST', 'patients', pCId, JSON.stringify({ action: 'create_patient' }), '192.168.1.10', daysAgo(90));
insertAudit.run(drMId, 'POST', 'health-metrics', null, JSON.stringify({ metric_type: 'blood_pressure' }), '192.168.1.10', daysAgo(2));
insertAudit.run(drOId, 'POST', 'health-metrics', null, JSON.stringify({ metric_type: 'glucose' }), '192.168.1.11', daysAgo(1));
insertAudit.run(drOId, 'PUT', 'appointments', null, JSON.stringify({ status: 'completed' }), '192.168.1.11', daysAgo(20));
insertAudit.run(drCId, 'POST', 'health-metrics', null, JSON.stringify({ metric_type: 'weight' }), '192.168.1.12', daysAgo(3));

console.log('✅ Audit log creado');

db.close();

console.log('');
console.log('🎉 Base de datos sembrada con éxito!');
console.log('');
console.log('👤 Usuarios disponibles:');
console.log('  📧 admin@healthtrack.com          | 🔑 Admin123!     (admin)');
console.log('  📧 elena.martinez@healthtrack.com  | 🔑 Doctor123!    (doctor - cardióloga)');
console.log('  📧 james.chen@healthtrack.com      | 🔑 Doctor123!    (doctor - medicina general)');
console.log('  📧 sarah.okonkwo@healthtrack.com   | 🔑 Doctor123!    (doctor - endocrinóloga)');
console.log('  📧 carlos.ruiz@email.com           | 🔑 Patient123!   (paciente - hipertensión)');
console.log('  📧 ana.garcia@email.com            | 🔑 Patient123!   (paciente - glucosa)');
console.log('  📧 miguel.torres@email.com         | 🔑 Patient123!   (paciente - control peso)');
console.log('  📧 sofia.rodriguez@email.com       | 🔑 Patient123!   (paciente - saludable)');
