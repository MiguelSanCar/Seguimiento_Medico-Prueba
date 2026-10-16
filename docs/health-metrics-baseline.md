# Línea base: health-metrics y notificaciones automáticas

> **Nota: snapshot histórico, superado.** Este documento describe el estado previo a los cambios de 2026-10-16 y ya no refleja el código. Los cambios posteriores: control de acceso en health-metrics (404 sin acceso; el paciente puede registrar las suyas), diastólica evaluada con la peor severidad, `POST` con 500 genérico (sin filtrar el mensaje de SQLite), métrica + alerta + notificación en una transacción, y nuevo módulo `/api/alerts`. La referencia vigente es [API.md](API.md).

Estado del código **antes de los cambios** (fecha: 2026-10-16). Fuente de verdad: `src/health-metrics/`, `src/notifications/`, `src/index.ts`. Documento de referencia para comparar tras las modificaciones; la referencia general de la API sigue en `docs/API.md`.

Prefijo del router: `/api/health-metrics` (`src/index.ts:33`). Notificaciones: `/api/notifications` (`src/index.ts:34`).

## Índice

1. [Comportamiento común](#comportamiento-común)
2. [Endpoints de health-metrics](#endpoints-de-health-metrics)
3. [Umbrales de checkMetricStatus](#umbrales-de-checkmetricstatus)
4. [Generación automática de notificaciones](#generación-automática-de-notificaciones)
5. [Endpoints de notifications](#endpoints-de-notifications)
6. [Hallazgos y deuda a vigilar](#hallazgos-y-deuda-a-vigilar)

## Comportamiento común

- Middlewares globales en orden: `cors`, `express.json()`, `rateLimiter`, `auditLogger`.
- Rate limit por IP: 100 peticiones por ventana de 60 s (`src/config.ts:25-28`). Al superarlo: `429 {"error":"Too many requests. Please try again later."}`. Cabeceras `X-RateLimit-Limit/Remaining/Reset`.
- Autenticación: solo `authenticate` (cabecera `Authorization: Bearer <token>`).
  - Sin cabecera: `401 {"error":"No token provided"}`
  - Token inválido/expirado: `401 {"error":"Invalid or expired token"}`
- **Ningún endpoint de health-metrics usa `authorize(...)` ni comprueba propiedad en el servicio** (ver hallazgos). Cualquier usuario autenticado, con cualquier rol, puede operar.
- Formato de respuesta: `{ data }`, `{ data, count }`, `{ error }`.
- Audit log: las respuestas `POST` con status < 400 se insertan en `audit_log` (`src/middleware/audit-logger.ts:9`). Los `GET` no se registran.

## Endpoints de health-metrics

Tipos válidos de `metric_type`: `blood_pressure`, `glucose`, `weight`, `heart_rate`, `temperature`, `oxygen_saturation`.

### GET /api/health-metrics/:patientId

Lista las métricas de un paciente, ordenadas por `recorded_at` descendente (`metrics.routes.ts:9`, `metrics.service.ts:45`).

- Roles: cualquier usuario autenticado (`admin`, `doctor`, `patient`), sin restricción por paciente.
- Ruta: `patientId` (entero). Si `parseInt` da `NaN` responde 400.
- Query (todas opcionales, sin validación de formato):
  - `type`: filtra por `metric_type` (comparación exacta; un valor desconocido devuelve lista vacía, no error).
  - `dateFrom`: `recorded_at >= dateFrom` (comparación de texto).
  - `dateTo`: `recorded_at <= dateTo` (comparación de texto).
- Un `patientId` inexistente devuelve `200` con `data: []` y `count: 0`.

Respuesta 200:

```json
{
  "data": [
    {
      "id": 41,
      "patient_id": 1,
      "metric_type": "blood_pressure",
      "value": 145,
      "secondary_value": 92,
      "unit": "mmHg",
      "recorded_at": "2026-10-10T08:30:00Z",
      "recorded_by": 2,
      "notes": null,
      "created_at": "2026-10-10 08:31:02",
      "recorded_by_name": "Dra. Elena Martinez"
    }
  ],
  "count": 1
}
```

Códigos: 200, 400 (`{"error":"Invalid patientId"}`), 401, 429, 500 (`{"error":"Failed to fetch metrics"}`).

```bash
curl "http://localhost:3000/api/health-metrics/1?type=glucose&dateFrom=2026-10-01" \
  -H "Authorization: Bearer $TOKEN"
```

### GET /api/health-metrics/:patientId/summary

Resumen por tipo de métrica (`metrics.routes.ts:23`, `metrics.service.ts:77`).

- Roles: cualquier usuario autenticado, sin restricción por paciente.
- Solo se incluyen tipos con al menos un registro. Paciente sin datos o inexistente: `{"data": []}` (sin `count`).
- Campos: `metric_type`, `latest_value`, `latest_secondary_value`, `latest_recorded_at`, `avg_value` (1 decimal), `min_value`, `max_value`, `count`, `trend`, `status`.
- `trend`: con al menos 6 registros compara la media de los 3 más recientes frente a los 3 anteriores; `rising`/`falling` si la diferencia absoluta supera el 3 % de la media anterior; si no, `stable` (también `stable` con menos de 6).
- `status`: `checkMetricStatus(tipo, latest_value)`.

Respuesta 200:

```json
{
  "data": [
    {
      "metric_type": "glucose",
      "latest_value": 118,
      "latest_secondary_value": null,
      "latest_recorded_at": "2026-10-10T07:00:00Z",
      "avg_value": 104.3,
      "min_value": 85,
      "max_value": 130,
      "count": 12,
      "trend": "rising",
      "status": "warning"
    }
  ]
}
```

Códigos: 200, 400 (`{"error":"Invalid patientId"}`), 401, 429, 500 (`{"error":"Failed to fetch summary"}`).

### POST /api/health-metrics

Registra una métrica (`metrics.routes.ts:35`, `metrics.service.ts:129`).

- Roles: cualquier usuario autenticado; puede registrar para cualquier `patient_id`. `recorded_by` se toma del token (`req.user.userId`).
- Body (JSON):

| Campo | Tipo | Obligatorio | Reglas |
|-------|------|-------------|--------|
| `patient_id` | number | Sí | Debe ser truthy (0 se rechaza). No se valida el tipo ni que exista. |
| `metric_type` | string | Sí | Uno de los 6 tipos válidos. |
| `value` | number | Sí | `undefined`/`null` se rechazan; debe ser numérico (`Number(value)`) y >= 0. |
| `unit` | string | Sí | Solo debe ser truthy; **no** se comprueba contra la unidad esperada. |
| `recorded_at` | string | Sí | Debe empezar con `YYYY-MM-DDTHH:MM` (ISO 8601). |
| `secondary_value` | number | No | Sin validación. Se guarda `null` si falta. Para presión arterial se espera la diastólica. |
| `notes` | string | No | Sin validación. |

Mensajes de validación 400 (en este orden de evaluación): `patient_id is required`, `metric_type is required`, `value is required`, `unit is required`, `recorded_at is required`, `metric_type must be one of: blood_pressure, glucose, weight, heart_rate, temperature, oxygen_saturation`, `value must be a number`, `value must be positive`, `recorded_at must be ISO 8601 format`.

Respuesta 201 (devuelve la métrica creada, no la notificación):

```json
{
  "data": {
    "id": 120,
    "patient_id": 1,
    "metric_type": "blood_pressure",
    "value": 150,
    "secondary_value": 95,
    "unit": "mmHg",
    "recorded_at": "2026-10-16T09:00:00Z",
    "recorded_by": 2,
    "notes": "Medición en reposo",
    "created_at": "2026-10-16 09:01:10",
    "recorded_by_name": "Dra. Elena Martinez"
  }
}
```

Códigos: 201, 400, 401, 429, 500. En 500 el mensaje es el `message` del error original (`metrics.routes.ts:43-44`); p. ej. un `patient_id` inexistente produce `{"error":"FOREIGN KEY constraint failed"}` porque `foreign_keys = ON` (`connection.ts:11`). No existen 403, 404 ni 409 en este endpoint.

Efectos secundarios: inserta fila en `health_metrics`; si el estado es `warning` o `critical`, crea una notificación (ver más abajo); la petición se registra en `audit_log`.

```bash
curl -X POST http://localhost:3000/api/health-metrics \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"patient_id":1,"metric_type":"blood_pressure","value":150,"secondary_value":95,"unit":"mmHg","recorded_at":"2026-10-16T09:00:00Z"}'
```

No existen endpoints de actualización ni borrado de métricas.

## Umbrales de checkMetricStatus

Función `checkMetricStatus(metricType, value)` en `metrics.service.ts:14`. Solo se evalúa `value` (el valor principal); **`secondary_value` nunca se evalúa**, por lo que la diastólica no genera alertas.

Lógica: si no hay rango para el tipo (`weight`) devuelve `normal`. Si `value` está en `[normalMin, normalMax]` (ambos inclusive) devuelve `normal`. Fuera de ese intervalo, devuelve `critical` si cumple la condición crítica del tipo y `warning` en caso contrario.

| Tipo | Unidad | Normal (inclusive) | Critical | Warning (resto) |
|------|--------|--------------------|----------|-----------------|
| `blood_pressure` (sistólica) | mmHg | 90 a 120 | > 140 o < 80 | (120, 140] y [80, 90) |
| `glucose` | mg/dL | 70 a 100 | > 125 o < 54 | (100, 125] y [54, 70) |
| `heart_rate` | bpm | 60 a 100 | > 120 o < 50 | (100, 120] y [50, 60) |
| `temperature` | °C | 36.1 a 37.2 | > 38.0 o < 35.5 | (37.2, 38.0] y [35.5, 36.1) |
| `oxygen_saturation` | % | 95 a 100 | < 90 | [90, 95) y > 100 |
| `weight` | kg | sin rango | nunca | nunca (siempre `normal`) |

Notas de comportamiento real:
- Los intervalos de warning cubren todos los huecos entre rangos (p. ej. 120.5 de sistólica o 36.05 °C son `warning`).
- Saturación > 100 se clasifica como `warning` (no es `normal` ni `critical`).
- Los valores `warningMin/warningMax/criticalMin/criticalMax` de `METRIC_RANGES` (`metrics.service.ts:6-12`) no se usan; los límites críticos están codificados dentro de la función.

## Generación automática de notificaciones

Ocurre únicamente en `createMetric` (`metrics.service.ts:154-171`), tras insertar la métrica y de forma síncrona (misma petición, sin transacción conjunta):

- Estado `normal`: no se crea notificación.
- Estado `warning` o `critical`: se llama a `createNotification` con:

| Campo | Valor |
|-------|-------|
| `patient_id` | el de la métrica |
| `type` | `metric_warning` o `metric_critical` |
| `title` | `<metric_type con _ -> espacio> <advertencia|crítico>`, p. ej. `blood pressure crítico`, `heart rate advertencia` |
| `message` | `Nivel de <metric_type con espacios> fuera de rango normal` |
| `severity` | `warning` o `critical` |
| `related_metric_id` | id de la métrica creada |
| `read` | 0 (por defecto) |

Ejemplo de notificación creada por una sistólica de 150:

```json
{
  "id": 15,
  "patient_id": 1,
  "type": "metric_critical",
  "title": "blood pressure crítico",
  "message": "Nivel de blood pressure fuera de rango normal",
  "severity": "critical",
  "read": 0,
  "related_metric_id": 120,
  "created_at": "2026-10-16 09:01:10"
}
```

Limitaciones actuales:
- El mensaje no incluye el valor, la unidad ni el paciente (`// DEBT` en `metrics.service.ts:160-162`).
- Título y mensaje usan el identificador técnico en inglés con guiones bajos sustituidos por espacios, mezclado con texto en español.
- No hay deduplicación ni límite de frecuencia: cada métrica anómala genera una notificación nueva.
- No se notifica al médico de forma directa; los médicos las ven por la relación `patients.assigned_doctor_id`.
- Si `createNotification` lanza, la métrica ya está insertada pero la petición responde 500.
- Las métricas insertadas por seed o por otras vías (no `createMetric`) no generan notificaciones.
- `appointment_reminder` y `general` existen como tipos pero ningún código los genera.

## Endpoints de notifications

Todos requieren `authenticate`; sin `authorize`. El filtrado por rol se hace en el servicio (`notifications.service.ts`).

| Método y ruta | Descripción | Respuesta |
|---------------|-------------|-----------|
| `GET /api/notifications` | Hasta 100 notificaciones, `created_at DESC`, con `patient_name`. `admin`: todas; `doctor`: de pacientes con `assigned_doctor_id = userId`; `patient`: las de su registro. | 200 `{ data, count }`; 401, 429, 500 `Failed to fetch notifications` |
| `GET /api/notifications/unread-count` | Número de no leídas con el mismo filtrado por rol. | 200 `{ "count": 3 }` (sin `data`); 401, 429, 500 `Failed to get unread count` |
| `PATCH /api/notifications/:id/read` | Marca como leída (`read = 1`). | 200 `{ "message": "Marked as read" }`; 400 `Invalid id`; 404 `Notification not found`; 401, 429, 500 `Failed to mark as read` |

Notas de `PATCH /:id/read`: `markAsRead` devuelve `false` tanto si la notificación no existe como si el usuario no tiene acceso (doctor no asignado, paciente ajeno), por lo que en ambos casos la respuesta es 404, nunca 403. La acción se registra en `audit_log`.

## Hallazgos y deuda a vigilar

Comportamiento real documentado arriba; estos puntos parecen bugs o deuda y no se han modificado:

1. **Falta control de acceso en health-metrics**: `metrics.routes.ts:9`, `:23` y `:35` solo usan `authenticate`. Un `patient` puede leer las métricas de otro paciente y crear métricas para cualquiera; un `doctor` puede operar sobre pacientes no asignados. Contradice el modelo de acceso por rol de CLAUDE.md.
2. **Diastólica sin evaluar**: `metrics.service.ts:155` solo pasa `dto.value`; `secondary_value` no se clasifica pese a que CLAUDE.md define rangos diastólicos.
3. **Discrepancia con CLAUDE.md en frecuencia cardíaca**: la tabla indica warning 50-59 y critical < 50; el código coincide (< 50 critical, 50 es warning). Sin discrepancia en el resto de umbrales comprobados.
4. **Audit log con `resource` incorrecto**: `audit-logger.ts:12-14` calcula `resource` y `resource_id` a partir de `req.path`; al estar montado a nivel de app, el path es `/api/health-metrics`, así que se guarda `resource = "api"` y `resource_id = null` (el `NaN` de `parseInt('health-metrics')` se convierte en `null`). Además `details` incluye el body completo.
5. **Validación laxa**: `unit` no se contrasta con `VALID_UNITS` (`metrics.validation.ts:3-10`, `:16`); `secondary_value` no es obligatorio para presión arterial (`// DEBT`, `metrics.validation.ts:27-29`); `patient_id` inexistente produce 500 con el mensaje de SQLite en lugar de 404/400; `patient_id: 0` se trata como ausente.
6. **Filtros de fecha** (`dateFrom`/`dateTo`) se comparan como texto sin validar formato; mezclar formatos (con `Z`, sin `T`) puede dar resultados inesperados.
7. **N+1 en el resumen**: una query por tipo (`// DEBT`, `metrics.service.ts:82-85`).
8. **Notificaciones**: mensaje sin valor (`// DEBT`, `metrics.service.ts:160-162`).
