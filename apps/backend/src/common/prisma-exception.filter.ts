import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Convert Prisma runtime errors into clean HTTP responses so the frontend
 * gets consistent JSON regardless of whether an error came from a validator
 * or from the DB layer.
 */
@Catch()
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      return res.status(exception.getStatus()).json(exception.getResponse());
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const { status, message } = this.mapPrismaCode(exception);
      this.logger.warn(`${exception.code} → ${status} ${message}`);
      return res.status(status).json({ statusCode: status, message, code: exception.code });
    }

    // Connection-level errors get their own type (P1XXX codes).
    if (exception instanceof Prisma.PrismaClientInitializationError) {
      this.logger.error(`Prisma init error: ${exception.errorCode} ${exception.message}`);
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: 503,
        message: 'Base de données injoignable.',
        code: exception.errorCode,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((exception as any)?.code === 'P1001' || (exception as any)?.code === 'P1017') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const code = (exception as any).code;
      this.logger.error(`Prisma ${code} — DB unreachable / connection lost`);
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: 503,
        message: 'Connexion à la base perdue. Réessaye dans quelques secondes.',
        code,
      });
    }

    this.logger.error(exception);
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: 500, message: 'Internal server error' });
  }

  private mapPrismaCode(e: Prisma.PrismaClientKnownRequestError) {
    switch (e.code) {
      case 'P2002': // unique constraint
        return { status: HttpStatus.CONFLICT, message: 'Cette valeur existe déjà.' };
      case 'P2003': // FK constraint
        return { status: HttpStatus.BAD_REQUEST, message: 'Référence invalide.' };
      case 'P2025': // record not found
        return { status: HttpStatus.NOT_FOUND, message: 'Ressource introuvable.' };
      default:
        return { status: HttpStatus.BAD_REQUEST, message: 'Erreur base de données.' };
    }
  }
}
