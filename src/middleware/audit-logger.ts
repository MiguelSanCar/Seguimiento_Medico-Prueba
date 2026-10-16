import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../database/connection';

export function auditLogger(req: Request, res: Response, next: NextFunction): void {
  const originalSend = res.json.bind(res);

  res.json = function (body: unknown) {
    // Solo registrar mutaciones exitosas
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && res.statusCode < 400) {
      try {
        const db = getDb();
        const parts = req.path.split('/').filter(Boolean);
        const resource = parts[0] || 'unknown';
        const resourceId = parts[1] ? parseInt(parts[1], 10) : null;

        db.prepare(`
          INSERT INTO audit_log (user_id, action, resource, resource_id, details, ip_address)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          req.user?.userId ?? null,
          req.method,
          resource,
          isNaN(resourceId as number) ? null : resourceId,
          JSON.stringify({ path: req.path, body: req.body }),
          req.ip || req.connection.remoteAddress || null
        );
      } catch {
        // No interrumpir la respuesta por errores de audit
      }
    }
    return originalSend(body);
  };

  next();
}
