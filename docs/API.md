# HealthTrack API — Referencia de endpoints

Documentación derivada del código (`src/`). Base URL en desarrollo: `http://localhost:3000`.

## Índice

- [Convenciones generales](#convenciones-generales)
- [Auth](#auth) — `POST /api/auth/register`, `POST /api/auth/login`
- [Patients](#patients)
- [Appointments](#appointments)
- [Health metrics](#health-metrics)
- [Notifications](#notifications)
- [Alerts](#alerts)
- [Otros](#otros)
- [Comportamientos a vigilar (posibles bugs)](#comportamientos-a-vigilar-posibles-bugs)

---

## Convenciones generales

**Autenticación:** `Authorization: Bearer <token>` (JWT HS256, caducidad 24 h, firmado con `JWT_SECRET`). Todas las rutas salvo `/api/auth/*` y `/api/health` usan `authenticate`.

**Formato de respuesta:**

```json
{ "data": [ ... ], "count": 2 }      // colección
{ "data": { ... } }                  // recurso
{ "message": "Patient deleted" }     // operación
{ "error": "descripción" }           // error
```

(Excepción: `GET /api/notifications/unread-count` devuelve `{ "count": 3 }`; `register`/`login` devuelven `{ "token", "user" }`.)

**Errores transversales (cualquier endpoint):**

| Código | Origen | Cuerpo |
|---|---|---|
| 401 | Sin cabecera Bearer | `{"error":"No token provided"}` |
| 401 | Token inválido/caducado | `{"error":"Invalid or expired token"}` |
| 403 | Rol no permitido en `authorize(...)` | `{"error":"Insufficient permissions"}` |
| 429 | Rate limit: 100 peticiones/60 s por IP (en memoria) | `{"error":"Too many requests. Please try again later."}` |
| 500 | Error interno | `{"error":"..."}` (ver cada endpoint) |

Cabeceras de rate limit en todas las respuestas: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (epoch en segundos).

El error handler global (`middleware/error-handler.ts`) captura lo no tratado: en desarrollo (`NODE_ENV` distinto de `production`) devuelve `{ error, stack, code }`; en producción `{"error":"Internal server error"}` para 5xx.

**Audit log:** toda respuesta `res.json` con status < 400 de `POST/PUT/PATCH/DELETE` inserta una fila en `audit_log` (usuario, método, recurso, id, `{path, body}`, IP). Ver [observaciones](#comportamientos-a-vigilar-posibles-bugs).

**Control de acceso por rol:** `admin` total; `doctor` sus pacientes/citas; `patient` solo lo propio. Lo que cada endpoint aplica realmente se indica abajo.

**Ejemplos `curl`** (usuarios seed, solo desarrollo):

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@healthtrack.com","password":"Admin123!"}' | jq -r .token)
```

---

## Auth

Prefijo `/api/auth`. Sin autenticación.

### POST /api/auth/register

Crea un usuario y devuelve su token.

**Body (JSON):**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `email` | string | sí | único |
| `password` | string | sí | sin otras reglas (se guarda con bcrypt, 10 rondas) |
| `name` | string | sí | |
| `role` | string | no | solo `patient` (por defecto). `doctor` y `admin` se rechazan con `403` |

**Respuestas:**

- `201`
```json
{ "token": "<jwt>", "user": { "id": 9, "email": "nuevo@email.com", "role": "patient", "name": "Nuevo Usuario", "created_at": "2026-10-16 10:00:00" } }
```
- `400` `{"error":"email, password and name are required"}`
- `403` `{"error":"Public registration only allows the patient role"}`
- `409` `{"error":"Email already registered"}`
- `429`, `500`

**Efectos:** registro en audit log (incluye el body, contraseña incluida; ver observaciones).

```bash
curl -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" \
  -d '{"email":"nuevo@email.com","password":"Secreto123!","name":"Nuevo Usuario","role":"patient"}'
```

### POST /api/auth/login

**Body:** `email` (string, obligatorio), `password` (string, obligatorio).

**Respuestas:**

- `200` `{ "token": "<jwt>", "user": { "id", "email", "role", "name", "created_at" } }`
  (el JWT contiene `userId`, `email`, `role`, `name`)
- `400` `{"error":"email and password are required"}`
- `401` `{"error":"Invalid credentials"}` (email inexistente o contraseña errónea)
- `429`, `500`

---

## Patients

Prefijo `/api/patients`. Todas requieren `authenticate`.

Objeto `Patient` devuelto: campos de `patients` (`id`, `user_id`, `date_of_birth`, `gender`, `blood_type`, `allergies`, `emergency_contact`, `emergency_phone`, `assigned_doctor_id`, `created_at`) más `name`, `email` (del usuario) y `doctor_name`. `allergies` se almacena como cadena JSON (`"[\"penicilina\"]"`).

### GET /api/patients

Roles: todos, filtrado por servicio: admin = todos; doctor = los de `assigned_doctor_id` = su id; patient = solo el suyo.

- `200`
```json
{ "data": [ { "id": 1, "user_id": 5, "date_of_birth": "1985-03-12", "gender": "male", "blood_type": "O+", "allergies": "[\"penicilina\"]", "emergency_contact": "Rosa Ruiz", "emergency_phone": "+34600111222", "assigned_doctor_id": 2, "created_at": "2026-10-01 09:00:00", "name": "Carlos Ruiz", "email": "carlos.ruiz@email.com", "doctor_name": "Dra. Elena Martínez" } ], "count": 1 }
```
- `401`, `429`, `500` `{"error":"Failed to fetch patients"}`

### GET /api/patients/:id

Roles: todos. `:id` entero (si no, `400 {"error":"Invalid patient id"}`).
Restricción: patient solo ve su propio registro (si no, 404). Doctor: **sin restricción** (ver observaciones).

- `200` `{ "data": { ...Patient } }`
- `400`, `401`, `404` `{"error":"Patient not found"}`, `429`, `500` `{"error":"Failed to fetch patient"}`

### POST /api/patients

Roles: `admin`, `doctor`.

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `user_id` | number | sí | truthy |
| `date_of_birth` | string | sí | `YYYY-MM-DD` |
| `gender` | string | no | `male`, `female`, `other` |
| `blood_type` | string | no | `A+ A- B+ B- AB+ AB- O+ O-` |
| `allergies` | array | no | se guarda con `JSON.stringify` |
| `emergency_contact` | string | no | |
| `emergency_phone` | string | no | |
| `assigned_doctor_id` | number | no | |

- `201` `{ "data": { ...Patient } }`
- `400` `{"error":"user_id is required"}`, `date_of_birth is required`, `date_of_birth must be in YYYY-MM-DD format`, `gender must be male, female or other`, `invalid blood_type`
- `401`, `403`, `429`, `500` (mensaje del error, p. ej. fallo de BD)

Efecto: audit log.

```bash
curl -X POST http://localhost:3000/api/patients -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"user_id":9,"date_of_birth":"1990-05-20","gender":"female","blood_type":"A+","allergies":["polen"],"assigned_doctor_id":2}'
```

### PUT /api/patients/:id

Roles: `admin`, `doctor` (sin comprobar que el doctor sea el asignado). Body: mismos campos que POST excepto `user_id` (ignorado), todos opcionales; mismas validaciones de formato. Body vacío devuelve el paciente sin cambios.

- `200` `{ "data": { ...Patient } }`
- `400` (id inválido o validación), `401`, `403`, `404` `{"error":"Patient not found"}`, `429`, `500` `{"error":"Failed to update patient"}`

Efecto: audit log.

### DELETE /api/patients/:id

Roles: solo `admin`. Borrado físico (hard delete).

- `200` `{ "message": "Patient deleted" }`
- `400`, `401`, `403`, `404`, `429`, `500` `{"error":"Failed to delete patient"}`

Efecto: audit log.

---

## Appointments

Prefijo `/api/appointments`. Todas requieren `authenticate`.

Objeto `Appointment`: `id`, `patient_id`, `doctor_id`, `date_time`, `duration_minutes`, `status` (`scheduled|confirmed|completed|cancelled`), `reason`, `notes`, `created_at`, `patient_name`, `doctor_name`.

### GET /api/appointments

Todos los roles; admin = todas; doctor = `doctor_id` propio; patient = las de su paciente. Orden `date_time` descendente.

- `200` `{ "data": [ {...} ], "count": 1 }`
```json
{ "data": [ { "id": 3, "patient_id": 1, "doctor_id": 2, "date_time": "2026-11-02T10:30", "duration_minutes": 30, "status": "scheduled", "reason": "Control de tensión", "notes": null, "created_at": "2026-10-16 09:00:00", "patient_name": "Carlos Ruiz", "doctor_name": "Dra. Elena Martínez" } ], "count": 1 }
```
- `401`, `429`, `500` `{"error":"Failed to fetch appointments"}`

### GET /api/appointments/:id

Todos los roles. Doctor solo si `doctor_id` es el suyo; patient solo si es su paciente (en otro caso 404).

- `200` `{ "data": {...} }`; `400 {"error":"Invalid id"}`; `401`; `404 {"error":"Appointment not found"}`; `429`; `500`

### POST /api/appointments

Roles: `admin`, `doctor`.

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `patient_id` | number | sí | |
| `doctor_id` | number | sí | |
| `date_time` | string | sí | ISO 8601 `YYYY-MM-DDTHH:MM` (regex de prefijo) |
| `duration_minutes` | number | no | 5–480; por defecto 30 |
| `reason` | string | no | |

- `201` `{ "data": {...} }`
- `400` `patient_id is required`, `doctor_id is required`, `date_time is required`, `date_time must be ISO 8601 format (YYYY-MM-DDTHH:MM)`, `duration_minutes must be between 5 and 480`
- `401`, `403`, `429`, `500`

Efecto: audit log. No se valida solapamiento ni que el doctor sea el asignado.

### PUT /api/appointments/:id

Roles: cualquier autenticado que pueda ver la cita (admin; doctor dueño; patient dueño). No hay `authorize`.

Body (todos opcionales): `date_time` (ISO 8601), `duration_minutes` (number; **no se valida en update**), `status` (`scheduled|confirmed|completed|cancelled`), `reason`, `notes`.

- `200` `{ "data": {...} }`
- `400` (`Invalid id`, `date_time must be ISO 8601 format`, `invalid status`), `401`, `404` (inexistente o sin acceso), `429`, `500` `{"error":"Failed to update appointment"}`

Efecto: audit log.

### DELETE /api/appointments/:id

Cancela (no borra): `status = 'cancelled'`. Mismas reglas de acceso que PUT.

- `200` `{ "message": "Appointment cancelled" }`
- `400`, `401`, `404`, `429`, `500` `{"error":"Failed to cancel appointment"}`

Efecto: audit log.

---

## Health metrics

Prefijo `/api/health-metrics`. Todas requieren `authenticate`; no usan `authorize`, pero aplican control de acceso por paciente (`canAccessPatient`, definido en `src/alerts/alerts.service.ts`): admin = cualquier paciente; doctor = solo pacientes con `assigned_doctor_id` = su id; patient = solo su propio registro. Si el paciente no existe o no hay acceso, se responde `404 {"error":"Patient not found"}` (no se distingue un caso del otro).

Tipos: `blood_pressure` (mmHg), `glucose` (mg/dL), `weight` (kg), `heart_rate` (bpm), `temperature` (°C), `oxygen_saturation` (%).

### GET /api/health-metrics/:patientId

`:patientId` = id de la tabla `patients` (entero; si no, `400 {"error":"Invalid patientId"}`).

Query opcional: `type` (tipo de métrica, sin validar), `dateFrom`, `dateTo` (comparación de texto sobre `recorded_at`, inclusive). Orden `recorded_at` descendente.

- `200`
```json
{ "data": [ { "id": 41, "patient_id": 1, "metric_type": "blood_pressure", "value": 145, "secondary_value": 92, "unit": "mmHg", "recorded_at": "2026-10-15T08:00:00", "recorded_by": 2, "notes": null, "created_at": "2026-10-15 08:01:00", "recorded_by_name": "Dra. Elena Martínez" } ], "count": 1 }
```
- `400`, `401`, `404`, `429`, `500` `{"error":"Failed to fetch metrics"}`. Un paciente sin datos devuelve `200` con lista vacía.

### GET /api/health-metrics/:patientId/summary

Un elemento por tipo con datos (los tipos sin registros se omiten).

- `200`
```json
{ "data": [ { "metric_type": "glucose", "latest_value": 112, "latest_secondary_value": null, "latest_recorded_at": "2026-10-15T07:30:00", "avg_value": 98.4, "min_value": 82, "max_value": 131, "count": 12, "trend": "rising", "status": "warning" } ] }
```
`trend`: `rising|falling|stable` (requiere >= 6 registros; compara media de los 3 últimos con los 3 anteriores, umbral 3 %). `status`: `normal|warning|critical` según el último valor (`weight` siempre `normal`).
- `400`, `401`, `404`, `429`, `500` `{"error":"Failed to fetch summary"}`
(El `status` del resumen se calcula solo con `latest_value`; no incluye la diastólica.)

### POST /api/health-metrics

Cualquier usuario autenticado con acceso al paciente: admin, doctor asignado o el propio paciente (un paciente puede registrar sus métricas). Primero se valida el body (400) y después el acceso (404).

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `patient_id` | number | sí | entero; si no existe o no hay acceso, `404` |
| `metric_type` | string | sí | uno de los 6 tipos |
| `value` | number | sí | numérico y >= 0 |
| `secondary_value` | number | no | (diastólica en `blood_pressure`; no se exige) |
| `unit` | string | sí | obligatorio pero **no se contrasta** con el tipo |
| `recorded_at` | string | sí | ISO 8601 `YYYY-MM-DDTHH:MM...` |
| `notes` | string | no | |

- `201` `{ "data": { ...métrica, "recorded_by": <userId del token>, "recorded_by_name": "..." } }`
- `400` `patient_id is required`, `metric_type is required`, `value is required`, `unit is required`, `recorded_at is required`, `metric_type must be one of: ...`, `value must be a number`, `value must be positive`, `recorded_at must be ISO 8601 format`
- `401`, `404` `{"error":"Patient not found"}` (inexistente o sin acceso), `429`
- `500` `{"error":"Failed to create metric"}` (genérico; ya no se filtra el mensaje de SQLite)

**Efectos secundarios:** métrica, alerta y notificación se crean en **una sola transacción** (si falla algo, no se guarda nada). Si la severidad evaluada es `warning` o `critical` se crea:

- una **alerta** (ver [Alerts](#alerts)) con `value` = el valor que disparó la severidad (sistólica o diastólica) y `severity` igual;
- una **notificación** (`type` `metric_warning`/`metric_critical`, `severity` igual, `title` p. ej. `glucose crítico` o `blood pressure advertencia`, `message` `Nivel de glucose fuera de rango normal`, `related_metric_id`).

En `blood_pressure` con `secondary_value` se evalúa también la diastólica (normal 60–80; warning 81–90 o <60; critical >90 o <50) y se usa la **peor severidad** entre ambas. Audit log.

Umbrales implementados (`checkMetricStatus`): normal dentro de [min, max]; critical si `blood_pressure` >140 o <80; `glucose` >125 o <54; `heart_rate` >120 o <50; `temperature` >38.0 o <35.5; `oxygen_saturation` <90; el resto `warning`. `weight` no genera alertas.

```bash
curl -X POST http://localhost:3000/api/health-metrics -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"patient_id":1,"metric_type":"glucose","value":145,"unit":"mg/dL","recorded_at":"2026-10-16T08:00"}'
```

---

## Notifications

Prefijo `/api/notifications`. Todas requieren `authenticate`; no se pueden crear por API (solo automáticas al registrar métricas).

Objeto: `id`, `patient_id`, `type` (`metric_warning|metric_critical|appointment_reminder|general`), `title`, `message`, `severity` (`info|warning|critical`), `read` (0/1), `related_metric_id`, `created_at`, `patient_name`.

### GET /api/notifications

admin = todas; doctor = de sus pacientes asignados; patient = las propias. Orden `created_at` descendente, máximo 100.

- `200` `{ "data": [ {...} ], "count": 1 }`
- `401`, `429`, `500` `{"error":"Failed to fetch notifications"}`

### GET /api/notifications/unread-count

- `200` `{ "count": 3 }` (mismo alcance por rol que el listado, sin límite de 100)
- `401`, `429`, `500` `{"error":"Failed to get unread count"}`

### PATCH /api/notifications/:id/read

admin: cualquiera; doctor: solo de sus pacientes asignados; patient: solo las propias.

- `200` `{ "message": "Marked as read" }`
- `400 {"error":"Invalid id"}`, `401`, `404 {"error":"Notification not found"}` (también si no tiene acceso), `429`, `500 {"error":"Failed to mark as read"}`

Efecto: audit log.

```bash
curl -X PATCH http://localhost:3000/api/notifications/5/read -H "Authorization: Bearer $TOKEN"
```

---

## Alerts

Prefijo `/api/alerts`. Todas requieren `authenticate`; sin `authorize`. Las alertas no se crean por API: las genera `POST /api/health-metrics` cuando la severidad es `warning` o `critical`.

**Modelo `Alert`** (tabla `alerts`):

| Campo | Tipo | Notas |
|---|---|---|
| `id` | number | PK autoincremental |
| `patient_id` | number | NOT NULL, FK `patients(id)` |
| `metric_id` | number | NOT NULL, FK `health_metrics(id)` |
| `metric_type` | string | NOT NULL, sin CHECK en la tabla |
| `value` | number | NOT NULL; valor que disparó la alerta (sistólica o diastólica) |
| `severity` | string | NOT NULL, CHECK `warning` \| `critical` |
| `created_at` | string | por defecto `datetime('now')` |
| `acknowledged` | 0 \| 1 | NOT NULL, por defecto 0, CHECK `IN (0,1)` |
| `acknowledged_by` | number \| null | FK `users(id)` |
| `acknowledged_at` | string \| null | |

Índices: `idx_alerts_patient_id (patient_id)`, `idx_alerts_patient_ack (patient_id, acknowledged)`.

**Reglas de acceso (ambos endpoints):** admin = cualquier paciente; doctor = solo pacientes con `assigned_doctor_id` = su id; patient = solo su propio registro (`patients.user_id`). Sin acceso se responde 404, sin distinguir inexistente de no autorizado.

### GET /api/alerts/:patientId

`:patientId` = id de la tabla `patients` (entero sin signo; si no, `400 {"error":"Invalid patientId"}`).

Query opcional:

| Parámetro | Valores | Error 400 |
|---|---|---|
| `severity` | `warning`, `critical` | `severity must be one of: warning, critical` |
| `acknowledged` | `true`, `1`, `false`, `0` | `acknowledged must be true or false` |

Orden `created_at` descendente, luego `id` descendente. Sin paginación.

- `200`
```json
{ "data": [ { "id": 7, "patient_id": 1, "metric_id": 41, "metric_type": "blood_pressure", "value": 95, "severity": "critical", "created_at": "2026-10-16 08:01:00", "acknowledged": 0, "acknowledged_by": null, "acknowledged_at": null } ], "count": 1 }
```
- `400`, `401`, `404` `{"error":"Patient not found"}`, `429`, `500` `{"error":"Failed to fetch alerts"}`

```bash
curl "http://localhost:3000/api/alerts/1?severity=critical&acknowledged=false" -H "Authorization: Bearer $TOKEN"
```

### PATCH /api/alerts/:id/acknowledge

Marca la alerta como reconocida (`acknowledged = 1`, `acknowledged_by` = usuario del token, `acknowledged_at` = ahora). **Idempotente:** si ya estaba reconocida no se modifica (se conservan `acknowledged_by`/`acknowledged_at` originales) y se devuelve igualmente 200 con la alerta. Sin body. `:id` entero sin signo.

- `200`
```json
{ "data": { "id": 7, "patient_id": 1, "metric_id": 41, "metric_type": "blood_pressure", "value": 95, "severity": "critical", "created_at": "2026-10-16 08:01:00", "acknowledged": 1, "acknowledged_by": 2, "acknowledged_at": "2026-10-16 09:15:00" } }
```
- `400 {"error":"Invalid id"}`, `401`, `404 {"error":"Alert not found"}` (inexistente o sin acceso), `429`, `500 {"error":"Failed to acknowledge alert"}`

Efecto: audit log.

```bash
curl -X PATCH http://localhost:3000/api/alerts/7/acknowledge -H "Authorization: Bearer $TOKEN"
```

---

## Otros

- `GET /api/health` — sin auth. `200 {"status":"ok","timestamp":"2026-10-16T10:00:00.000Z"}`.
- Cualquier otra ruta GET devuelve `public/index.html` (fallback SPA), incluidas rutas `/api/...` inexistentes.
- CORS: orígenes `http://localhost:3000` y `http://127.0.0.1:3000`.

---

## Comportamientos a vigilar (posibles bugs)

Documentados tal como funciona el código; no se ha modificado `src/`.

1. `src/patients/patients.service.ts:54-58` — un doctor puede leer cualquier paciente por id (FIXME en código).
2. `src/patients/patients.routes.ts:46` — `PUT /api/patients/:id` no limita al doctor a sus pacientes.
3. ~~Métricas sin control de acceso (IDOR)~~ — corregido: `metrics.routes.ts:14,30,46` aplican `canAccessPatient` (404 sin acceso).
4. ~~El registro público permitía `role: "admin"`~~ — corregido: solo se permite `patient`.
5. `src/middleware/audit-logger.ts:12-13` — está montado con `app.use` sin prefijo, por lo que `req.path` es `/api/patients/1`: `resource` queda siempre `api` y `resource_id` siempre `null`. Además `details` guarda `req.body` completo, incluida la contraseña en `/api/auth/register` (`audit-logger.ts:24`).
6. ~~JWT secret hardcodeado~~ — corregido: se lee de `JWT_SECRET` (mín. 32 caracteres; obligatoria con `NODE_ENV=production`; en desarrollo se genera un secreto aleatorio por proceso). Pendiente: `src/middleware/error-handler.ts:17-24` expone `stack` y mensajes internos en desarrollo.
7. `src/patients/patients.service.ts:111-113` — borrado físico (el comentario DEBT dice que debería ser soft delete).
8. `src/health-metrics/metrics.validation.ts:27` — no se exige `secondary_value` en `blood_pressure`; `unit` no se valida contra el tipo. (La diastólica ya se evalúa para alertas cuando se envía; el 500 genérico ya no filtra el mensaje de SQLite: ambos corregidos.)
9. `src/appointments/appointments.validation.ts:21-35` — `duration_minutes` no se valida en PUT; `body.status`/`patient_id` falsy (p. ej. `0`) se tratan como ausentes.
10. `src/index.ts:42` — el fallback SPA responde 200 HTML a rutas API GET inexistentes en lugar de 404 JSON.
11. `src/notifications/notifications.service.ts` — el mensaje de la notificación no incluye el valor medido (DEBT en `metrics.service.ts:171`).
12. `src/health-metrics/metrics.service.ts:19-41` — `oxygen_saturation` con valor >100 (fuera de rango físico) cae en la rama `warning` y genera alerta y notificación; la validación solo exige `value` >= 0.
13. `src/alerts/alerts.service.ts:17` — admin siempre pasa `canAccessPatient`, así que `GET /api/alerts/9999` (paciente inexistente) responde `200 {"data":[],"count":0}` en vez de 404. Con `GET /api/health-metrics/9999` ocurre lo mismo para admin.
14. `src/alerts/alerts.routes.ts:30` / `alerts.service.ts:47-49` — sin paginación ni límite en el listado de alertas.
