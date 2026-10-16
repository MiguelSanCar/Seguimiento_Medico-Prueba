# HealthTrack API

API REST de seguimiento de salud con dashboard visual interactivo.

## Inicio rápido

```bash
npm install
npm run db:seed
npm run dev
```

Abre http://localhost:3000 — el dashboard ya tiene datos de ejemplo cargados.

**Login rápido en el dashboard:**
- Admin: `admin@healthtrack.com` / `Admin123!`
- Doctor: `elena.martinez@healthtrack.com` / `Doctor123!`
- Paciente: `carlos.ruiz@email.com` / `Patient123!`

## Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express
- **Base de datos**: SQLite con better-sqlite3
- **Auth**: JWT + bcrypt
- **Tests**: Vitest
- **Frontend**: HTML + Tailwind CSS + Chart.js (sin build step)

## Endpoints principales

```
POST   /api/auth/register
POST   /api/auth/login

GET    /api/patients
GET    /api/patients/:id
POST   /api/patients
PUT    /api/patients/:id
DELETE /api/patients/:id

GET    /api/appointments
POST   /api/appointments
PUT    /api/appointments/:id
DELETE /api/appointments/:id

GET    /api/health-metrics/:patientId
GET    /api/health-metrics/:patientId/summary
POST   /api/health-metrics

GET    /api/notifications
GET    /api/notifications/unread-count
PATCH  /api/notifications/:id/read
```

Todas las rutas (excepto auth) requieren `Authorization: Bearer <token>`.

## Scripts

```bash
npm run dev          # Servidor desarrollo con hot-reload
npm run build        # Compilar TypeScript
npm test             # Ejecutar tests
npm run db:seed      # Poblar base de datos
npm run db:reset     # Reset completo de la base de datos
```

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | `3000` | Puerto del servidor |
| `DB_PATH` | `healthtrack.db` | Ruta del archivo SQLite |
| `NODE_ENV` | `development` | Entorno (`development`/`production`) |

Ver `CLAUDE.md` para documentación completa del proyecto.
