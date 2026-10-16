# HealthTrack API — Guía para Claude Code

Este proyecto es el proyecto troncal del **Módulo 8 del curso de Claude Code**. Los alumnos crearán subagentes especializados para analizar, testear, documentar y mejorar este sistema.

---

## Levantar el entorno

```bash
npm install          # Instalar dependencias
npm run db:seed      # Poblar base de datos con datos de ejemplo
npm run dev          # Servidor en modo desarrollo (http://localhost:3000)
```

Otros comandos:
```bash
npm run build        # Compilar TypeScript a dist/
npm test             # Ejecutar tests con Vitest
npm run test:watch   # Tests en modo watch
npm run db:reset     # Borrar DB y re-sembrar datos
```

---

## Estructura de carpetas

```
src/
├── index.ts                 # Entry point: Express app, middlewares, rutas
├── config.ts                # Configuración centralizada (puerto, JWT, DB path...)
├── auth/                    # Autenticación JWT
│   ├── auth.routes.ts       # POST /api/auth/register, POST /api/auth/login
│   ├── auth.service.ts      # registerUser(), loginUser(), verifyToken()
│   ├── auth.middleware.ts   # authenticate() y authorize(...roles) middlewares
│   └── auth.types.ts        # User, Role, TokenPayload, AuthResponse
├── patients/                # CRUD de pacientes
│   ├── patients.routes.ts   # GET/POST/PUT/DELETE /api/patients
│   ├── patients.service.ts  # Lógica de negocio con acceso por rol
│   ├── patients.validation.ts # Validación de inputs
│   └── patients.types.ts    # Patient, CreatePatientDTO, UpdatePatientDTO
├── appointments/            # Gestión de citas médicas
│   ├── appointments.routes.ts
│   ├── appointments.service.ts
│   ├── appointments.validation.ts
│   └── appointments.types.ts
├── health-metrics/          # Métricas de salud con detección de anomalías
│   ├── metrics.routes.ts
│   ├── metrics.service.ts   # checkMetricStatus(), getPatientSummary(), createMetric()
│   ├── metrics.validation.ts
│   └── metrics.types.ts
├── notifications/           # Alertas automáticas por métricas
│   ├── notifications.routes.ts
│   ├── notifications.service.ts
│   └── notifications.types.ts
├── middleware/
│   ├── error-handler.ts     # Error handler global Express
│   ├── audit-logger.ts      # Logging de mutaciones para compliance
│   └── rate-limiter.ts      # Rate limiting in-memory por IP
└── database/
    ├── connection.ts        # Singleton SQLite (getDb(), setDb())
    ├── migrations.ts        # Crea tablas si no existen
    └── seed.ts              # Datos de ejemplo realistas
public/
└── index.html               # Dashboard SPA (Tailwind + Chart.js + Vanilla JS)
tests/
├── setup.ts                 # DB en memoria para tests, helpers createTestUser()
├── auth.test.ts             # Tests de autenticación
└── patients.test.ts         # Tests de pacientes
```

---

## Convenciones de código

### Nomenclatura
- Archivos: `kebab-case` (ej: `patients.service.ts`)
- Funciones: `camelCase` (ej: `getPatientById`)
- Tipos/Interfaces: `PascalCase` (ej: `CreatePatientDTO`)
- Variables de entorno: `UPPER_SNAKE_CASE`

### Respuestas de la API
Todas las respuestas siguen este formato:

```json
// Éxito con colección:
{ "data": [...], "count": 42 }

// Éxito con un recurso:
{ "data": { ... } }

// Mensaje de operación:
{ "message": "Patient deleted" }

// Error:
{ "error": "descripción del error" }
```

Códigos HTTP:
- `200` — OK
- `201` — Creado
- `400` — Validación fallida
- `401` — No autenticado
- `403` — Sin permisos
- `404` — No encontrado
- `409` — Conflicto (ej: email duplicado)
- `429` — Rate limit
- `500` — Error interno

### Control de acceso por rol
- `admin` — acceso total
- `doctor` — ve sus pacientes asignados y sus citas
- `patient` — ve solo su propio registro y sus citas

### Manejo de errores
Los servicios lanzan `Error` con mensaje descriptivo. Las rutas capturan y devuelven HTTP apropiado. El error handler global en `middleware/error-handler.ts` maneja lo que no se captura explícitamente.

---

## Rangos normales de métricas de salud

| Métrica | Unidad | Normal | Warning | Critical |
|---------|--------|--------|---------|----------|
| Presión sistólica | mmHg | 90–120 | 121–140 / <90 | >140 / <80 |
| Presión diastólica | mmHg | 60–80 | 81–90 / <60 | >90 / <50 |
| Glucosa (ayunas) | mg/dL | 70–100 | 101–125 / <70 | >125 / <54 |
| Peso | kg | — | — | — (no genera alertas) |
| Ritmo cardíaco | bpm | 60–100 | 101–120 / 50–59 | >120 / <50 |
| Temperatura | °C | 36.1–37.2 | 37.3–38.0 / <36.0 | >38.0 / <35.5 |
| Saturación O₂ | % | 95–100 | 90–94 | <90 |

---

## Usuarios seed para testing

| Email | Contraseña | Rol | Descripción |
|-------|-----------|-----|-------------|
| `admin@healthtrack.com` | `Admin123!` | admin | Acceso total |
| `elena.martinez@healthtrack.com` | `Doctor123!` | doctor | Cardióloga, pacientes: Carlos, Sofía, Laura |
| `james.chen@healthtrack.com` | `Doctor123!` | doctor | Medicina general, pacientes: Miguel, David |
| `sarah.okonkwo@healthtrack.com` | `Doctor123!` | doctor | Endocrinóloga, pacientes: Ana, María, Thomas |
| `carlos.ruiz@email.com` | `Patient123!` | patient | Hipertensión incipiente |
| `ana.garcia@email.com` | `Patient123!` | patient | Glucosa con picos esporádicos |
| `miguel.torres@email.com` | `Patient123!` | patient | Pérdida de peso progresiva |
| `sofia.rodriguez@email.com` | `Patient123!` | patient | Todos los valores normales |

---

## Base de datos

SQLite con `better-sqlite3`. El archivo es `healthtrack.db` en la raíz del proyecto (configurable con la variable de entorno `DB_PATH`).

Las queries son SQL directo (sin ORM) para facilitar el análisis por subagentes especializados en bases de datos.

El singleton de conexión está en `src/database/connection.ts`. Para tests se usa una DB en memoria mediante `setDb()`.

---

## Nota para el curso

> Este proyecto es el proyecto troncal del **Módulo 8 del curso de Claude Code**. Los alumnos crearán subagentes especializados para trabajar con él:
> - **security-auditor**: encontrará vulnerabilidades de seguridad en el código
> - **test-writer**: añadirá cobertura de tests a los módulos
> - **db-analyst**: analizará y optimizará las queries SQL
> - **doc-generator**: generará documentación de la API
> - **code-reviewer**: revisará calidad y deuda técnica

Los comentarios `// DEBT:` y `// FIXME:` en el código marcan áreas de mejora intencionalmente dejadas para los ejercicios del curso.
