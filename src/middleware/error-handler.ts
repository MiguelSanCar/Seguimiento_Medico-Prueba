import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;

  // FIXME: En modo desarrollo se envía el mensaje SQL completo al cliente.
  // Esto expone información interna de la base de datos (nombres de tablas,
  // columnas, constraints) que podría usarse para exploits.
  if (config.isDevelopment) {
    res.status(statusCode).json({
      error: err.message,
      stack: err.stack,
      code: err.code,
    });
    return;
  }

  // En producción, mensajes genéricos
  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal server error' : err.message,
  });
}
