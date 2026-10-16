import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { getDb } from './database/connection';
import { rateLimiter } from './middleware/rate-limiter';
import { auditLogger } from './middleware/audit-logger';
import { errorHandler } from './middleware/error-handler';
import authRoutes from './auth/auth.routes';
import patientsRoutes from './patients/patients.routes';
import appointmentsRoutes from './appointments/appointments.routes';
import metricsRoutes from './health-metrics/metrics.routes';
import notificationsRoutes from './notifications/notifications.routes';
import alertsRoutes from './alerts/alerts.routes';

const app = express();

// Middlewares globales
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
}));
app.use(express.json());
app.use(rateLimiter);
app.use(auditLogger);

// Archivos estáticos (dashboard)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/health-metrics', metricsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/alerts', alertsRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handler global (debe ir al final)
app.use(errorHandler);

// Inicializar DB y arrancar
getDb(); // Ejecuta migraciones al arrancar

app.listen(config.port, () => {
  console.log(`🏥 HealthTrack API corriendo en http://localhost:${config.port}`);
  console.log(`📊 Dashboard: http://localhost:${config.port}`);
  console.log(`🌍 Entorno: ${config.isDevelopment ? 'development' : 'production'}`);
});

export default app;
